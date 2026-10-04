import type { Objective, Sex } from './types';

/** The words for Sex (BR-REC-49) and Goal (BR-REC-03) on screen. Plan words are `PLAN_LABELS`. */
export const SEX_LABELS: Record<Sex, string> = { male: 'Male', female: 'Female' };

export const OBJECTIVE_LABELS: Record<Objective, string> = {
  fat_loss: 'Fat loss',
  strength: 'Strength',
  general_fitness: 'General fitness',
  other: 'Other',
};
