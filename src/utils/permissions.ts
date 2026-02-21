import { IUser } from '../models/user.model';

export const isSubActive = (user: IUser | null | undefined): boolean => {
    if (!user) return false;
    
    // Explicitly suspended/banned
    if (user.subscriptionStatus === 'suspended') return false; 
    
    // Active is good
    if (user.subscriptionStatus === 'active') return true;
    
    // Trial check
    if (user.subscriptionStatus === 'trial') {
        const trialEnds = user.trialEndsAt ? new Date(user.trialEndsAt) : null;
        // Check if trial end date is in the future
        if (trialEnds && trialEnds.getTime() > Date.now()) return true;
    }
    
    // past_due, cancelled, or expired trial
    return false;
};

export const isTycoon = (user: IUser | any): boolean => {
    return String(user?.planType || '').toUpperCase() === 'TYCOON';
};
