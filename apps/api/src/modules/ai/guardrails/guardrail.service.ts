export interface GuardrailResult {
  safe: boolean;
  response: string;
  violation?: string;
}

export class GuardrailService {
  check(response: string, forbiddenClaims: string[]) : GuardrailResult {
    const lowered = response.toLowerCase();
    const violation = forbiddenClaims.find((claim) => claim && lowered.includes(claim.toLowerCase()));
    if (violation) {
      return {
        safe: false,
        violation,
        response: 'I do not want to give unsupported information. A team member can follow up with the correct details.',
      };
    }
    const genericViolations = ['guaranteed discount', 'guaranteed approval', 'lowest price guaranteed'];
    const generic = genericViolations.find((claim) => lowered.includes(claim));
    if (generic) {
      return {
        safe: false,
        violation: generic,
        response: 'I cannot promise that. A team member can confirm the latest approved details.',
      };
    }
    return { safe: true, response };
  }
}
