import axios, { AxiosError } from 'axios';
import { AdminSettings } from '../models/adminSettings.model';
import { decryptEmailCredential, encryptEmailCredential } from './emailSecurity.service';

const REACH_API_BASE_URL = 'https://developers.hostinger.com/api/reach/v1';
const REQUEST_TIMEOUT_MS = 15_000;

type ReachProfile = {
  uuid: string;
  domain?: string;
};

type ReachProfileResource = {
  status?: string;
  profiles?: ReachProfile[];
  limits?: {
    subscribers_limit?: number;
    emails_monthly_limit?: number;
  };
};

type ReachContact = {
  email: string;
  name?: string;
  surname?: string;
  phone?: string;
};

type ExistingReachContact = {
  uuid: string;
  email: string;
};

type ReachSettings = {
  enabled: boolean;
  apiToken: string;
  profileUuid: string;
  senderName: string;
  senderEmail: string;
  automationTagUuid: string;
  automationUuid: string;
};

const readReachSettings = async (): Promise<ReachSettings> => {
  const settings = await AdminSettings.findOne().select('+hostingerReach.apiToken').lean();
  const stored = (settings as any)?.hostingerReach;
  if (!stored?.enabled) throw new Error('Hostinger Reach is disabled in Admin Settings.');
  if (!stored.apiToken) throw new Error('Hostinger Reach API token is missing.');

  if (!String(stored.apiToken).startsWith('enc:v1:')) {
    await AdminSettings.updateOne(
      { _id: (settings as any)._id },
      { $set: { 'hostingerReach.apiToken': encryptEmailCredential(String(stored.apiToken)) } }
    );
  }

  return {
    enabled: true,
    apiToken: decryptEmailCredential(String(stored.apiToken)),
    profileUuid: String(stored.profileUuid || '').trim(),
    senderName: String(stored.senderName || 'TallyPadi').trim(),
    senderEmail: String(stored.senderEmail || '').trim().toLowerCase(),
    automationTagUuid: String(stored.automationTagUuid || '').trim(),
    automationUuid: String(stored.automationUuid || '').trim(),
  };
};

const reachClient = (apiToken: string) => axios.create({
  baseURL: REACH_API_BASE_URL,
  timeout: REQUEST_TIMEOUT_MS,
  headers: {
    Authorization: `Bearer ${apiToken}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  },
});

const describeReachError = (error: unknown) => {
  if (!axios.isAxiosError(error)) return error instanceof Error ? error.message : 'Hostinger Reach request failed.';
  const axiosError = error as AxiosError<any>;
  const status = axiosError.response?.status;
  const data = axiosError.response?.data;
  const detail = data?.message || data?.error || data?.detail;
  if (status === 401) return 'Hostinger Reach rejected the API token.';
  if (status === 422) return `Hostinger Reach rejected the campaign data${detail ? `: ${detail}` : '.'}`;
  if (status === 429) return 'Hostinger Reach rate limit reached. Wait briefly and try again.';
  if (axiosError.code === 'ECONNABORTED') return 'Hostinger Reach timed out. Try again.';
  return `Hostinger Reach request failed${status ? ` (${status})` : ''}${detail ? `: ${detail}` : '.'}`;
};

const flattenProfiles = (resources: ReachProfileResource[]) => resources.flatMap((resource) =>
  (resource.profiles || []).map((profile) => ({
    ...profile,
    status: resource.status || '',
    limits: resource.limits || {},
  }))
);

export const testHostingerReachConnection = async () => {
  const config = await readReachSettings();
  try {
    const client = reachClient(config.apiToken);
    const response = await client.get<ReachProfileResource[]>('/profiles');
    const profiles = flattenProfiles(Array.isArray(response.data) ? response.data : []);
    const resolvedProfileUuid = config.profileUuid || profiles[0]?.uuid || '';
    let tags: Array<{ uuid: string; value: string }> = [];
    let automations: Array<{ uuid: string; name: string; status: string; type: string }> = [];

    if (resolvedProfileUuid) {
      const profilePath = `/profiles/${encodeURIComponent(resolvedProfileUuid)}`;
      const [tagResponse, automationResponse] = await Promise.all([
        client.get(`${profilePath}/tags`),
        client.get(`${profilePath}/automations`, { params: { status: 'active', page: 1, per_page: 100 } }),
      ]);
      tags = Array.isArray(tagResponse.data) ? tagResponse.data : [];
      automations = Array.isArray(automationResponse.data?.data) ? automationResponse.data.data : [];
    }

    return {
      configuredProfileUuid: config.profileUuid,
      resolvedProfileUuid,
      profiles,
      tags,
      automations,
    };
  } catch (error) {
    throw new Error(describeReachError(error));
  }
};

const genericReachHtml = (html: string) => html
  .replace(/##usershopname##/g, 'your business')
  .replace(/##phonenumber##/g, '')
  .replace(/##name##/g, 'there')
  .replace(/{{unsubscribe_link}}/g, '#');

const normalizePhone = (value: unknown) => {
  const digits = String(value || '').replace(/\D/g, '');
  return /^\d{7,15}$/.test(digits) ? `+${digits}` : undefined;
};

const splitName = (value: unknown) => {
  const parts = String(value || '').trim().split(/\s+/).filter(Boolean);
  return {
    name: parts[0] || undefined,
    surname: parts.length > 1 ? parts.slice(1).join(' ') : undefined,
  };
};

const normalizeValidEmail = (value: unknown) => {
  const email = String(value || '').trim().toLowerCase();
  if (!email || email.length > 254) return '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return '';
  return email;
};

const mapRecipientsToContacts = (
  recipients: Array<{ email?: string; name?: string; businessName?: string; phoneNumber?: string }>
) => {
  const mappedContacts: ReachContact[] = recipients.flatMap((recipient) => {
      const email = normalizeValidEmail(recipient.email);
      if (!email) return [];
      const shopName = String(recipient.businessName || '').trim();
      const ownerName = String(recipient.name || '').trim();
      const parsedOwnerName = splitName(ownerName);
      const phone = normalizePhone(recipient.phoneNumber);
      return [{
        email,
        ...((shopName || parsedOwnerName.name) ? { name: shopName || parsedOwnerName.name } : {}),
        ...(shopName && ownerName ? { surname: ownerName } : parsedOwnerName.surname ? { surname: parsedOwnerName.surname } : {}),
        ...(phone ? { phone } : {}),
      }];
    });
  return Array.from(new Map(mappedContacts.map((contact) => [contact.email, contact])).values());
};

const listExistingReachContacts = async (
  client: ReturnType<typeof reachClient>,
  profilePath: string,
  tagUuid?: string
): Promise<ExistingReachContact[]> => {
  const baseParams = { per_page: 100, ...(tagUuid ? { tag_uuid: tagUuid } : {}) };
  const first = await client.get(`${profilePath}/contacts`, { params: { ...baseParams, page: 1 } });
  const contacts = Array.isArray(first.data?.data) ? first.data.data : [];
  const total = Math.max(contacts.length, Number(first.data?.meta?.total || 0));
  const totalPages = Math.ceil(total / 100);

  if (totalPages > 1) {
    const pages = await Promise.all(
      Array.from({ length: totalPages - 1 }, (_, index) =>
        client.get(`${profilePath}/contacts`, { params: { ...baseParams, page: index + 2 } })
      )
    );
    for (const page of pages) {
      if (Array.isArray(page.data?.data)) contacts.push(...page.data.data);
    }
  }

  return contacts.filter((contact: ExistingReachContact) => contact?.uuid && contact?.email);
};

export type PrepareReachCampaignInput = {
  recipients: Array<{ email?: string; name?: string; businessName?: string; phoneNumber?: string }>;
  target: string;
  subject: string;
  title: string;
  html: string;
};

export const prepareHostingerReachCampaign = async (input: PrepareReachCampaignInput) => {
  const config = await readReachSettings();
  if (!config.profileUuid) throw new Error('Hostinger Reach Profile UUID is missing in Admin Settings.');
  if (!config.senderEmail) throw new Error('Hostinger Reach sender email is missing in Admin Settings.');

  const contacts = mapRecipientsToContacts(input.recipients);

  if (!contacts.length) throw new Error('No valid email recipients matched this Reach campaign.');
  if (contacts.length > 1000) throw new Error('Hostinger Reach accepts at most 1,000 contacts per bulk import. Narrow the audience and try again.');

  const client = reachClient(config.apiToken);
  const profilePath = `/profiles/${encodeURIComponent(config.profileUuid)}`;
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const audienceTag = `TallyPadi ${input.target} ${timestamp}`.slice(0, 255);
  const campaignTitle = String(input.title || input.subject || `TallyPadi ${timestamp}`).slice(0, 255);
  const campaignHtml = genericReachHtml(input.html);

  try {
    const [existingContacts, tagResponse, templateResponse] = await Promise.all([
      listExistingReachContacts(client, profilePath),
      client.post(`${profilePath}/tags`, { names: [audienceTag] }),
      client.post(`${profilePath}/templates`, {
        title: campaignTitle,
        template_content: campaignHtml,
      }),
    ]);

    const tag = Array.isArray(tagResponse.data) ? tagResponse.data[0] : undefined;
    const tagUuid = tag?.uuid;
    const templateUuid = templateResponse.data?.uuid;
    if (!tagUuid || !templateUuid) throw new Error('Hostinger Reach did not return the new tag or template ID.');

    const selectedEmails = new Set(contacts.map((contact) => contact.email));
    const existingContactUuids = existingContacts
      .filter((contact) => selectedEmails.has(String(contact.email).trim().toLowerCase()))
      .map((contact) => contact.uuid);

    const operations: Array<Promise<any>> = [
      client.post(`${profilePath}/contacts/bulk`, {
        contacts,
        tag_uuids: [tagUuid],
        note: 'Imported from TallyPadi admin broadcast',
      }),
    ];
    if (existingContactUuids.length) {
      operations.push(client.post(`${profilePath}/tags/${encodeURIComponent(tagUuid)}/contacts`, {
        contact_uuids: existingContactUuids,
        all_contacts: false,
      }));
    }
    operations.push(client.post(`${profilePath}/campaigns`, {
        sender_name: config.senderName.slice(0, 50),
        sender_email: config.senderEmail,
        title: campaignTitle,
        subject: input.subject,
        template_uuid: templateUuid,
        metadata: { source: 'tallypadi-admin' },
    }));
    const operationResults = await Promise.all(operations);
    const campaignResponse = operationResults[operationResults.length - 1];

    return {
      campaignUuid: campaignResponse.data?.uuid || '',
      templateUuid,
      audienceTag,
      audienceTagUuid: tagUuid,
      contactsQueued: contacts.length,
      contactsSkipped: Math.max(0, input.recipients.length - contacts.length),
      existingContactsTagged: existingContactUuids.length,
      status: campaignResponse.data?.status || 'draft',
    };
  } catch (error) {
    if (error instanceof Error && !axios.isAxiosError(error)) throw error;
    throw new Error(describeReachError(error));
  }
};

export type TriggerReachAutomationInput = {
  recipients: Array<{ email?: string; name?: string; businessName?: string; phoneNumber?: string }>;
  target: string;
};

export const triggerHostingerReachAutomation = async (input: TriggerReachAutomationInput) => {
  const config = await readReachSettings();
  if (!config.profileUuid) throw new Error('Hostinger Reach Profile UUID is missing in Admin Settings.');
  if (!config.automationTagUuid) throw new Error('Hostinger Reach automation audience tag is missing in Admin Settings.');
  if (!config.automationUuid) throw new Error('Hostinger Reach automation is missing in Admin Settings.');

  const contacts = mapRecipientsToContacts(input.recipients);
  if (!contacts.length) throw new Error('No valid email recipients matched this Reach automation.');
  if (contacts.length > 1000) throw new Error('Hostinger Reach accepts at most 1,000 contacts per bulk import. Narrow the audience and try again.');

  const client = reachClient(config.apiToken);
  const profilePath = `/profiles/${encodeURIComponent(config.profileUuid)}`;

  try {
    const validationRequests: Array<Promise<any>> = [
      client.get(`${profilePath}/tags`),
      client.get(`${profilePath}/automations/${encodeURIComponent(config.automationUuid)}`),
      client.get(`${profilePath}/automations/${encodeURIComponent(config.automationUuid)}/steps`),
    ];
    const validationResults = await Promise.all(validationRequests);
    const tags = Array.isArray(validationResults[0].data) ? validationResults[0].data : [];
    const audienceTag = tags.find((tag: { uuid?: string }) => tag.uuid === config.automationTagUuid);
    if (!audienceTag) throw new Error('The configured Hostinger Reach automation tag was not found in this profile.');

    const automation = validationResults[1]?.data;
    if (!automation || automation.status !== 'active') {
      throw new Error('The configured Hostinger Reach automation is not active.');
    }
    const steps = Array.isArray(validationResults[2]?.data) ? validationResults[2].data : [];
    const triggerStep = steps.find((step: { type?: string }) => step.type === 'trigger');
    const triggerType = String(triggerStep?.value || '');
    if (!['new_contact', 'new_segment_contact'].includes(triggerType)) {
      throw new Error('The configured Reach automation must use a New contact or Contact enters segment trigger.');
    }

    const [existingContacts, alreadyTaggedContacts] = await Promise.all([
      listExistingReachContacts(client, profilePath),
      listExistingReachContacts(client, profilePath, config.automationTagUuid),
    ]);
    const selectedEmails = new Set(contacts.map((contact) => contact.email));
    const existingEmails = new Set(existingContacts.map((contact) => String(contact.email).trim().toLowerCase()));
    const alreadyTaggedEmails = new Set(alreadyTaggedContacts.map((contact) => String(contact.email).trim().toLowerCase()));
    const existingContactUuids = existingContacts
      .filter((contact) => selectedEmails.has(String(contact.email).trim().toLowerCase()))
      .map((contact) => contact.uuid);
    const newContactCount = contacts.filter((contact) => !existingEmails.has(contact.email)).length;
    const newAudienceMemberCount = contacts.filter((contact) => !alreadyTaggedEmails.has(contact.email)).length;

    const operations: Array<Promise<any>> = [
      client.post(`${profilePath}/contacts/bulk`, {
        contacts,
        tag_uuids: [config.automationTagUuid],
        note: `TallyPadi ${input.target} automation`.slice(0, 75),
      }),
    ];
    if (existingContactUuids.length) {
      operations.push(client.post(
        `${profilePath}/tags/${encodeURIComponent(config.automationTagUuid)}/contacts`,
        { contact_uuids: existingContactUuids, all_contacts: false }
      ));
    }
    await Promise.all(operations);

    return {
      automationUuid: config.automationUuid,
      audienceTag: audienceTag.value || config.automationTagUuid,
      audienceTagUuid: config.automationTagUuid,
      contactsQueued: contacts.length,
      contactsSkipped: Math.max(0, input.recipients.length - contacts.length),
      existingContactsTagged: existingContactUuids.length,
      newContacts: newContactCount,
      newAudienceMembers: newAudienceMemberCount,
      triggerType,
      triggerCandidates: triggerType === 'new_contact' ? newContactCount : newAudienceMemberCount,
      status: 'audience_synced',
    };
  } catch (error) {
    if (error instanceof Error && !axios.isAxiosError(error)) throw error;
    throw new Error(describeReachError(error));
  }
};
