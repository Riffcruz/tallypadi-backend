import { Schema, model, Document } from 'mongoose';

export interface IEmailTemplate extends Document {
  title: string;
  subject: string;
  htmlBody: string;
  createdAt: Date;
  updatedAt: Date;
}

const emailTemplateSchema = new Schema<IEmailTemplate>(
  {
    title: { type: String, required: true },
    subject: { type: String, required: true },
    htmlBody: { type: String, required: true }
  },
  { timestamps: true }
);

export const EmailTemplate = model<IEmailTemplate>('EmailTemplate', emailTemplateSchema);
