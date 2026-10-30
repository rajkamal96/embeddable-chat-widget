import { notFound } from 'next/navigation';
import { demoPages } from '../content';

export const dynamicParams = false;

export function generateStaticParams() {
  return demoPages()
    .filter((p) => p.slug)
    .map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return { title: `${demoPages().find((p) => p.slug === slug)?.title ?? 'Page'} · Acme Dental (demo)` };
}

export default async function DemoPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = demoPages().find((p) => p.slug === slug);
  if (!page) notFound();
  return <div dangerouslySetInnerHTML={{ __html: page.html }} />;
}
