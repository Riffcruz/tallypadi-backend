import { Request, Response } from 'express';
import { Types } from 'mongoose';
import { SellerVerification, SellerIdType } from '../models/sellerVerification.model';
import { User } from '../models/user.model';
import { r2Service } from '../services/r2.service';
import {
  sendSellerReverificationRequestedEmail,
  sendSellerVerificationAdminNotification,
  sendSellerVerificationApprovedEmail,
} from '../services/email.service';

const VERIFICATION_CONSENT_VERSION = 'seller-verification-v1';
const ID_TYPES: SellerIdType[] = ['NIN', 'NATIONAL_ID', 'DRIVERS_LICENSE', 'INTERNATIONAL_PASSPORT', 'GOVERNMENT_ID'];
const IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp'];
const DOCUMENT_MIMES = [...IMAGE_MIMES, 'application/pdf'];

const cleanText = (value: unknown, maxLength: number) =>
  String(value || '')
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);

const getUserId = (req: Request) => String(req.user?.id || '');
const getAdminId = (req: Request) => String(req.admin?._id || req.user?.id || '');

const verificationAssetUrls = (verification: any) => [
  verification?.documentFrontUrl,
  verification?.documentBackUrl,
  verification?.selfieCenterUrl,
  verification?.selfieLeftUrl,
  verification?.selfieRightUrl,
  verification?.selfieUpUrl,
  verification?.selfieDownUrl,
].filter((value): value is string => Boolean(value));

const syncUserMarketplaceVerificationStatus = async (userId: Types.ObjectId) => {
  const remaining = await SellerVerification.find({ user: userId })
    .select('status reviewedAt submittedAt createdAt')
    .sort({ createdAt: -1 })
    .lean();

  const approved = remaining.find((item) => item.status === 'APPROVED');
  if (approved) {
    await User.updateOne(
      { _id: userId },
      {
        $set: {
          marketplaceVerificationStatus: 'VERIFIED',
          marketplaceVerifiedAt: approved.reviewedAt || approved.submittedAt || approved.createdAt || new Date(),
        },
      }
    );
    return;
  }

  const pending = remaining.find((item) => item.status === 'PENDING');
  if (pending) {
    await User.updateOne(
      { _id: userId },
      {
        $set: {
          marketplaceVerificationStatus: 'PENDING',
          marketplaceVerifiedAt: null,
        },
      }
    );
    return;
  }

  const rejected = remaining.find((item) => item.status === 'REJECTED');
  await User.updateOne(
    { _id: userId },
    {
      $set: {
        marketplaceVerificationStatus: rejected ? 'REJECTED' : 'UNVERIFIED',
        marketplaceVerifiedAt: null,
      },
    }
  );
};

const publicVerification = (verification: any) => verification ? {
  id: String(verification._id),
  status: verification.status,
  countryCode: verification.countryCode,
  idType: verification.idType,
  fullName: verification.fullName,
  address: verification.address,
  submittedAt: verification.submittedAt,
  reviewedAt: verification.reviewedAt || null,
  rejectionReason: verification.rejectionReason || null,
} : null;

export const getMySellerVerification = async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const [user, verification] = await Promise.all([
      User.findById(userId).select('marketplaceVerificationStatus marketplaceVerifiedAt').lean(),
      SellerVerification.findOne({ user: userId }).sort({ createdAt: -1 }).lean(),
    ]);

    return res.json({
      status: user?.marketplaceVerificationStatus || 'UNVERIFIED',
      verifiedAt: user?.marketplaceVerifiedAt || null,
      verification: publicVerification(verification),
    });
  } catch (error) {
    console.error('Get seller verification error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const getSellerVerificationUploadUrl = async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const mime = String(req.body?.mime || '');
    const ext = cleanText(req.body?.ext || 'jpg', 12).replace(/[^a-z0-9]/gi, '').toLowerCase();
    const purpose = cleanText(req.body?.purpose || 'document', 40);
    const allowed = purpose.startsWith('selfie') ? IMAGE_MIMES : DOCUMENT_MIMES;

    if (!allowed.includes(mime)) {
      return res.status(400).json({ error: purpose.startsWith('selfie') ? 'Selfie uploads must be an image.' : 'Document uploads must be an image or PDF.' });
    }

    const result = await r2Service.getPresignedPutUrl(mime, ext || (mime === 'application/pdf' ? 'pdf' : 'jpg'));
    return res.json(result);
  } catch (error) {
    console.error('Seller verification upload URL error:', error);
    return res.status(500).json({ error: 'Failed to create upload URL' });
  }
};

export const submitSellerVerification = async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const existingPending = await SellerVerification.findOne({ user: user._id, status: 'PENDING' }).lean();
    if (existingPending) {
      return res.status(409).json({ error: 'You already have a verification request pending review.' });
    }

    const countryCode = cleanText(req.body?.countryCode || user.countryCode || user.settings?.location?.country || 'NG', 3).toUpperCase();
    const idType = cleanText(req.body?.idType, 40) as SellerIdType;
    const fullName = cleanText(req.body?.fullName, 160);
    const address = cleanText(req.body?.address || user.settings?.location?.address, 500);
    const governmentIdNumber = cleanText(req.body?.governmentIdNumber, 120);
    const documentFrontUrl = cleanText(req.body?.documentFrontUrl, 1000);
    const selfieCenterUrl = cleanText(req.body?.selfieCenterUrl, 1000);
    const selfieLeftUrl = cleanText(req.body?.selfieLeftUrl, 1000);
    const selfieRightUrl = cleanText(req.body?.selfieRightUrl, 1000);
    const selfieUpUrl = cleanText(req.body?.selfieUpUrl, 1000);
    const selfieDownUrl = cleanText(req.body?.selfieDownUrl, 1000);

    const requiresDocumentUpload = idType !== 'NIN';

    if (!ID_TYPES.includes(idType)) return res.status(400).json({ error: 'Select a valid ID type.' });
    if (idType === 'NIN' && !governmentIdNumber) {
      return res.status(400).json({ error: 'NIN number is required.' });
    }
    if (!fullName || !address || !selfieCenterUrl || (requiresDocumentUpload && !documentFrontUrl)) {
      return res.status(400).json({
        error: requiresDocumentUpload
          ? 'Full name, address, front ID document, and center face capture are required.'
          : 'Full name, address, NIN number, and center face capture are required.',
      });
    }
    if (countryCode !== 'NG' && (!selfieLeftUrl || !selfieRightUrl || !selfieUpUrl || !selfieDownUrl)) {
      return res.status(400).json({ error: 'Non-Nigerian verification requires center, left, right, up, and down face captures.' });
    }
    if (!Boolean(req.body?.consentAccepted)) {
      return res.status(400).json({ error: 'Consent is required before submitting identity verification.' });
    }

    const verification = await SellerVerification.create({
      user: user._id,
      status: 'PENDING',
      countryCode,
      idType,
      fullName,
      dateOfBirth: cleanText(req.body?.dateOfBirth, 20) || null,
      address,
      governmentIdNumber: governmentIdNumber || null,
      documentFrontUrl: requiresDocumentUpload ? documentFrontUrl : null,
      documentBackUrl: requiresDocumentUpload ? cleanText(req.body?.documentBackUrl, 1000) || null : null,
      selfieCenterUrl,
      selfieLeftUrl: selfieLeftUrl || null,
      selfieRightUrl: selfieRightUrl || null,
      selfieUpUrl: selfieUpUrl || null,
      selfieDownUrl: selfieDownUrl || null,
      consentAccepted: true,
      consentVersion: VERIFICATION_CONSENT_VERSION,
      submittedAt: new Date(),
    });

    user.marketplaceVerificationStatus = 'PENDING';
    user.marketplaceVerifiedAt = null;
    await user.save();

    sendSellerVerificationAdminNotification({
      verificationId: String(verification._id),
      fullName,
      businessName: user.businessName || user.name,
      phoneNumber: user.phoneNumber,
      email: user.email,
      countryCode,
      idType,
    }).catch((emailError) => {
      console.error('Seller verification admin email failed:', emailError);
    });

    return res.status(201).json({
      message: 'Verification submitted for admin review.',
      verification: publicVerification(verification),
    });
  } catch (error) {
    console.error('Submit seller verification error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const listSellerVerificationsForAdmin = async (req: Request, res: Response) => {
  try {
    const status = cleanText(req.query.status || 'PENDING', 20).toUpperCase();
    const query: Record<string, unknown> = {};
    if (['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'].includes(status)) query.status = status;

    const verifications = await SellerVerification.find(query)
      .populate('user', 'businessName phoneNumber email shopSlug countryCode marketplaceVerificationStatus')
      .sort({ submittedAt: -1, createdAt: -1 })
      .limit(200)
      .lean();

    return res.json({ verifications });
  } catch (error) {
    console.error('Admin seller verification list error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const getSellerVerificationForAdmin = async (req: Request, res: Response) => {
  try {
    const verificationId = String(req.params.id || '');
    if (!Types.ObjectId.isValid(verificationId)) return res.status(400).json({ error: 'Invalid verification ID' });
    const verification = await SellerVerification.findById(verificationId)
      .select('+governmentIdNumber')
      .populate('user', 'businessName phoneNumber email shopSlug countryCode marketplaceVerificationStatus marketplaceVerifiedAt')
      .lean();
    if (!verification) return res.status(404).json({ error: 'Verification not found' });
    return res.json({ verification });
  } catch (error) {
    console.error('Admin seller verification detail error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const approveSellerVerificationForAdmin = async (req: Request, res: Response) => {
  try {
    const verificationId = String(req.params.id || '');
    if (!Types.ObjectId.isValid(verificationId)) return res.status(400).json({ error: 'Invalid verification ID' });
    const verification = await SellerVerification.findById(verificationId);
    if (!verification) return res.status(404).json({ error: 'Verification not found' });
    if (verification.status !== 'PENDING') return res.status(400).json({ error: 'Only pending verifications can be approved.' });

    const adminId = getAdminId(req);
    if (!Types.ObjectId.isValid(adminId)) return res.status(403).json({ error: 'Admin identity could not be resolved.' });

    verification.status = 'APPROVED';
    verification.reviewedAt = new Date();
    verification.reviewedBy = new Types.ObjectId(adminId);
    verification.rejectionReason = null;
    await verification.save();

    const seller = await User.findById(verification.user).select('businessName name email');
    await User.updateOne(
      { _id: verification.user },
      {
        $set: {
          marketplaceVerificationStatus: 'VERIFIED',
          marketplaceVerifiedAt: verification.reviewedAt,
        },
      }
    );

    if (seller?.email) {
      sendSellerVerificationApprovedEmail(
        seller.email,
        verification.fullName || seller.businessName || seller.name || 'Seller'
      ).catch((emailError) => {
        console.error('Seller verification approval email failed:', emailError);
      });
    }

    return res.json({ message: 'Seller verified successfully.', verification: publicVerification(verification) });
  } catch (error) {
    console.error('Admin approve seller verification error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const rejectSellerVerificationForAdmin = async (req: Request, res: Response) => {
  try {
    const verificationId = String(req.params.id || '');
    if (!Types.ObjectId.isValid(verificationId)) return res.status(400).json({ error: 'Invalid verification ID' });
    const reason = cleanText(req.body?.reason || 'Verification rejected by admin.', 1000);
    const verification = await SellerVerification.findById(verificationId);
    if (!verification) return res.status(404).json({ error: 'Verification not found' });
    if (verification.status !== 'PENDING') return res.status(400).json({ error: 'Only pending verifications can be rejected.' });

    const adminId = getAdminId(req);
    if (!Types.ObjectId.isValid(adminId)) return res.status(403).json({ error: 'Admin identity could not be resolved.' });

    verification.status = 'REJECTED';
    verification.reviewedAt = new Date();
    verification.reviewedBy = new Types.ObjectId(adminId);
    verification.rejectionReason = reason;
    await verification.save();

    await User.updateOne(
      { _id: verification.user },
      {
        $set: {
          marketplaceVerificationStatus: 'REJECTED',
          marketplaceVerifiedAt: null,
        },
      }
    );

    return res.json({ message: 'Seller verification rejected.', verification: publicVerification(verification) });
  } catch (error) {
    console.error('Admin reject seller verification error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const deleteSellerVerificationForAdmin = async (req: Request, res: Response) => {
  try {
    const verificationId = String(req.params.id || '');
    if (!Types.ObjectId.isValid(verificationId)) return res.status(400).json({ error: 'Invalid verification ID' });

    const verification = await SellerVerification.findById(verificationId);
    if (!verification) return res.status(404).json({ error: 'Verification not found' });

    const userId = verification.user as Types.ObjectId;
    const assets = verificationAssetUrls(verification);

    await Promise.all(assets.map((url) => r2Service.deleteFile(url)));
    await verification.deleteOne();
    await syncUserMarketplaceVerificationStatus(userId);

    return res.json({
      message: 'Seller verification and uploaded assets deleted.',
      deletedAssets: assets.length,
    });
  } catch (error) {
    console.error('Admin delete seller verification error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const requestSellerReverificationForAdmin = async (req: Request, res: Response) => {
  try {
    const verificationId = String(req.params.id || '');
    if (!Types.ObjectId.isValid(verificationId)) return res.status(400).json({ error: 'Invalid verification ID' });

    const verification = await SellerVerification.findById(verificationId);
    if (!verification) return res.status(404).json({ error: 'Verification not found' });
    if (verification.status !== 'APPROVED') {
      return res.status(400).json({ error: 'Only approved verifications can be sent for reverification.' });
    }

    const adminId = getAdminId(req);
    if (!Types.ObjectId.isValid(adminId)) return res.status(403).json({ error: 'Admin identity could not be resolved.' });

    const reason = cleanText(req.body?.reason || 'TallyPadi needs you to complete seller verification again.', 1000);
    verification.status = 'CANCELLED';
    verification.reviewedAt = new Date();
    verification.reviewedBy = new Types.ObjectId(adminId);
    verification.rejectionReason = reason;
    await verification.save();

    const seller = await User.findByIdAndUpdate(
      verification.user,
      {
        $set: {
          marketplaceVerificationStatus: 'REVERIFY_REQUIRED',
          marketplaceVerifiedAt: null,
        },
      },
      { new: true }
    ).select('businessName name email');

    if (seller?.email) {
      sendSellerReverificationRequestedEmail(
        seller.email,
        verification.fullName || seller.businessName || seller.name || 'Seller',
        reason
      ).catch((emailError) => {
        console.error('Seller reverification email failed:', emailError);
      });
    }

    return res.json({
      message: 'Seller has been asked to reverify. Their verified badge has been removed.',
      verification: publicVerification(verification),
    });
  } catch (error) {
    console.error('Admin request seller reverification error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
