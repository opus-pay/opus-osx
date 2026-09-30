import { descriptionOf } from "@opus/sdk";

export const CRITERIA_KINDS = ["code", "report", "design", "errand"] as const;
export type CriteriaKind = (typeof CRITERIA_KINDS)[number];

const BODY: Record<CriteriaKind, string> = {
    code: "The change builds, the named tests pass, and the diff matches the request.",
    report: "The report answers each question, cites its sources, and states what it could not check.",
    design: "The files match the agreed size and format, and the visible text is the agreed copy.",
    errand: "The place was visited in the agreed window, and the proof shows the requested result.",
};

/** Written criteria for a pilot job. Plain text is hashed into the job by the SDK. */
export function criteriaText(kind: CriteriaKind, notes: string): string {
    const extra = notes.trim();
    return extra === "" ? BODY[kind] : `${BODY[kind]}\n${extra}`;
}

export function criteriaHash(text: string): string {
    return descriptionOf(text);
}

/**
 * Optional assistant. With no endpoint the template is the criteria.
 * With an endpoint, POST `{ vague, template }` and read `{ criteria }`.
 */
export async function suggestCriteria(
    vague: string,
    kind: CriteriaKind,
    endpoint: string | undefined,
    fetchImpl: typeof fetch = fetch
): Promise<string> {
    const template = criteriaText(kind, vague);
    if (endpoint === undefined || endpoint.trim() === "") return template;
    const response = await fetchImpl(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ vague, template }),
    });
    if (!response.ok) throw new Error(`Criteria assistant responded ${response.status}`);
    const body = (await response.json()) as { criteria?: unknown };
    if (typeof body.criteria !== "string" || body.criteria.trim() === "") {
        throw new Error("Criteria assistant returned no text");
    }
    return body.criteria.trim();
}
