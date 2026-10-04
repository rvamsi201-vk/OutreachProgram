import type { CampaignCondition } from '@ai-crm/shared';

export type ConditionContext = Record<string, unknown>;

function readPath(context: ConditionContext, path: string) {
  return path.split('.').reduce<unknown>((value, part) => {
    if (value && typeof value === 'object' && part in value) {
      return (value as Record<string, unknown>)[part];
    }
    return undefined;
  }, context);
}

export class ConditionEvaluator {
  evaluate(condition: CampaignCondition, context: ConditionContext) {
    const value = readPath(context, condition.if);
    return condition.in.some((item) => item === value);
  }

  evaluateAll(conditions: CampaignCondition[], context: ConditionContext) {
    return conditions.every((condition) => this.evaluate(condition, context));
  }
}
