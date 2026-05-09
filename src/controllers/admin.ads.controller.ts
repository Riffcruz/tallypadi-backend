import { Request, Response } from 'express';
import { AdCampaign } from '../models/adCampaign.model';
import {
  AdCampaignError,
  approveAdCampaign,
  completeAdCampaign,
  markExpiredCampaignsCompleted,
  normalizeCampaignStatus,
  rejectAdCampaign,
  serializeAdCampaign,
} from '../services/adCampaign.service';

const getAdminId = (req: Request) => String(req.admin?._id || req.user?.id || '');

export const getAdminAdCampaigns = async (req: Request, res: Response) => {
  try {
    await markExpiredCampaignsCompleted();

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const status = normalizeCampaignStatus(req.query.status);
    const query: Record<string, unknown> = {};
    if (status) query.status = status;

    const [campaigns, total, statusCounts] = await Promise.all([
      AdCampaign.find(query)
        .populate('user', 'businessName name email phoneNumber planType walletBalance shopSlug')
        .populate('product', 'name quantity lastUnitPrice image category isPublished')
        .populate('reviewedBy', 'businessName name email phoneNumber role')
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      AdCampaign.countDocuments(query),
      AdCampaign.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
    ]);

    return res.json({
      campaigns: campaigns.map(serializeAdCampaign),
      counts: statusCounts.reduce((acc: Record<string, number>, item: { _id: string; count: number }) => {
        acc[item._id] = item.count;
        return acc;
      }, {}),
      pagination: {
        page,
        limit,
        totalItems: total,
        totalPages: Math.ceil(total / limit),
        hasMore: page * limit < total,
      },
    });
  } catch (error) {
    console.error('Admin Ads List Error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

export const approveAdminAdCampaign = async (req: Request, res: Response) => {
  try {
    const campaign = await approveAdCampaign(String(req.params.id || ''), getAdminId(req));
    const freshCampaign = await AdCampaign.findById(campaign._id)
      .populate('user', 'businessName name email phoneNumber planType walletBalance shopSlug')
      .populate('product', 'name quantity lastUnitPrice image category isPublished')
      .populate('reviewedBy', 'businessName name email phoneNumber role')
      .lean();

    return res.json({
      message: 'Ad campaign approved and started',
      campaign: freshCampaign ? serializeAdCampaign(freshCampaign) : serializeAdCampaign(campaign),
    });
  } catch (error) {
    if (error instanceof AdCampaignError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    console.error('Admin Ads Approve Error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

export const rejectAdminAdCampaign = async (req: Request, res: Response) => {
  try {
    const campaign = await rejectAdCampaign(String(req.params.id || ''), getAdminId(req), req.body?.reason);
    const freshCampaign = await AdCampaign.findById(campaign._id)
      .populate('user', 'businessName name email phoneNumber planType walletBalance shopSlug')
      .populate('product', 'name quantity lastUnitPrice image category isPublished')
      .populate('reviewedBy', 'businessName name email phoneNumber role')
      .lean();

    return res.json({
      message: 'Ad campaign rejected and wallet refunded',
      campaign: freshCampaign ? serializeAdCampaign(freshCampaign) : serializeAdCampaign(campaign),
    });
  } catch (error) {
    if (error instanceof AdCampaignError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    console.error('Admin Ads Reject Error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

export const completeAdminAdCampaign = async (req: Request, res: Response) => {
  try {
    const campaign = await completeAdCampaign(String(req.params.id || ''), getAdminId(req));
    const freshCampaign = await AdCampaign.findById(campaign._id)
      .populate('user', 'businessName name email phoneNumber planType walletBalance shopSlug')
      .populate('product', 'name quantity lastUnitPrice image category isPublished')
      .populate('reviewedBy', 'businessName name email phoneNumber role')
      .lean();

    return res.json({
      message: 'Ad campaign marked completed',
      campaign: freshCampaign ? serializeAdCampaign(freshCampaign) : serializeAdCampaign(campaign),
    });
  } catch (error) {
    if (error instanceof AdCampaignError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    console.error('Admin Ads Complete Error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};
