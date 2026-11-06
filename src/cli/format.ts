/**
 * Rendering of validation issues for humans.
 *
 * @packageDocumentation
 */

import type { JmValidationIssue } from '../serialization/validation.ts';

/**
 * Renders validation issues as an indented block.
 *
 * @remarks
 * Code first so a reader can scan a column of caps-lock tokens and find the one
 * that matters, path second because that is what they need to act on.
 *
 * @param errors - Issues to render.
 * @returns One block of text, no trailing newline.
 */
export function formatIssues(errors: JmValidationIssue[]): string {
    return errors
        .map(issue => `  ${issue.code}  ${issue.path || '<root>'}\n    ${issue.message}`)
        .join('\n');
}
