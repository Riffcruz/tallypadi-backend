import { Schema, model } from 'mongoose';

const trafficVisitSchema = new Schema(
  {
    date: { type: String, required: true },
    source: { type: String, required: true, lowercase: true, trim: true },
    path: { type: String, required: true, trim: true },
    count: { type: Number, default: 0, min: 0 },
    lastVisitedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

trafficVisitSchema.index({ date: 1, source: 1, path: 1 }, { unique: true });
trafficVisitSchema.index({ source: 1, date: -1 });

export const TrafficVisit = model('TrafficVisit', trafficVisitSchema);
