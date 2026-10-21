export type Status = 'draft' | 'scheduled' | 'active' | 'ended' | 'cancelled';
export type Action = 'schedule' | 'activate' | 'end' | 'cancel';

export const ACTION_TARGET: Record<Action, Status> = { schedule: 'scheduled', activate: 'active', end: 'ended', cancel: 'cancelled' };
const ALLOWED_FROM: Record<Action, readonly Status[]> = {
  schedule: ['draft'],
  activate: ['draft', 'scheduled'],
  end: ['active'],
  cancel: ['draft', 'scheduled'],
};
/** repeating an action on a campaign that already got there changes nothing (a retried request is not an error) */
const ALREADY_THERE: Record<Action, readonly Status[]> = {
  schedule: ['scheduled', 'active'],
  activate: ['active'],
  end: ['ended'],
  cancel: ['cancelled'],
};

export type Step = 'apply' | 'noop' | 'invalid';
export function stepFor(action: Action, from: Status): Step {
  if (ALLOWED_FROM[action].includes(from)) return 'apply';
  return ALREADY_THERE[action].includes(from) ? 'noop' : 'invalid';
}

/** only a draft can be edited or deleted: the sale prices of a scheduled or running campaign are already on the marketplace prices */
export const isEditable = (s: Status): boolean => s === 'draft';
/** states in which the campaign's sale prices exist on the marketplace prices */
export const hasLiveSales = (s: Status): boolean => s === 'scheduled' || s === 'active';
