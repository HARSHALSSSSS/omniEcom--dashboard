import { isFeatureEnabled, type Tx } from '@oms/database';
import { AppError } from '@oms/shared';
import { getSettings } from './recommend';

/** AI is off when the platform flag is off for this vendor OR the vendor switched it off */
export async function aiGate(tx: Tx, vendorId: string): Promise<void> {
  if (!(await isFeatureEnabled(tx, 'ai.enabled', vendorId, true))) throw new AppError('FORBIDDEN', 'AI features are not enabled for this business', { details: { rule: 'feature_disabled', flag: 'ai.enabled' } });
  if (!(await getSettings(tx, vendorId)).enabled) throw new AppError('FORBIDDEN', 'AI is switched off in your AI settings', { details: { rule: 'ai_disabled' } });
}
