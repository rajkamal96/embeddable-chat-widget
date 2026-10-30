export interface Chunk {
  /** Stable id the model must cite, e.g. "services#2". */
  id: string;
  /** Page title. */
  title: string;
  /** Heading path inside the page, e.g. "Teeth whitening". May be empty. */
  heading: string;
  /** Page URL, optionally with a #anchor. Relative paths are resolved server-side. */
  href: string;
  text: string;
  /** First chunk of each page: used to give broad questions an overview of every page. */
  overview?: boolean;
}

export interface Source {
  title: string;
  href: string;
}

export interface Scored {
  chunk: Chunk;
  score: number;
}

export interface SiteIndex {
  site: string;
  generatedAt: string;
  pages: { title: string; href: string }[];
  chunks: Chunk[];
}
