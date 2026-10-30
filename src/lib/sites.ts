import { z } from 'zod';
import type { SiteIndex } from './types';

/** Per-site configuration: lives in data/sites/<id>/site.json. */
export const SiteConfigSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/, 'lowercase letters, digits and dashes only'),
  /** Business name shown in the widget header and used in prompts. */
  name: z.string().min(1).max(60),
  assistantName: z.string().min(1).max(40).default('Assistant'),
  themeColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'use a 6-digit hex colour such as #0f766e'),
  welcomeMessage: z.string().min(1).max(300),
  suggestedQuestions: z.array(z.string().min(2).max(100)).max(4).default([]),
  /**
   * Origins allowed to call the API from a browser, e.g. "https://www.acmedental.example".
   * A leading "*." matches any subdomain: "https://*.acmedental.example".
   */
  allowedOrigins: z.array(z.string()).min(1),
  /** Demo convenience: also accept calls from the host serving this API. */
  allowSameOrigin: z.boolean().default(false),
  /** Public base URL used to resolve relative source links. Empty = the API's own origin. */
  baseUrl: z.string().default(''),
  /** Where a visitor should go when the content does not cover a question. */
  contactHint: z.string().max(200).default('contacting the business directly'),
  /** Shows a "demo" label in the widget footer. */
  demo: z.boolean().default(false),
});

export type SiteConfig = z.infer<typeof SiteConfigSchema>;

export interface Site {
  config: SiteConfig;
  index: SiteIndex;
}

/** The part of the config that is safe to send to any browser. */
export function publicConfig(c: SiteConfig) {
  return {
    id: c.id,
    name: c.name,
    assistantName: c.assistantName,
    themeColor: c.themeColor,
    welcomeMessage: c.welcomeMessage,
    suggestedQuestions: c.suggestedQuestions,
    demo: c.demo,
  };
}

export type SiteRegistry = Record<string, Site>;
