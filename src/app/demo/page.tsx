import { demoPages } from './content';

export default function DemoHome() {
  const page = demoPages().find((p) => p.slug === '')!;
  return <div dangerouslySetInnerHTML={{ __html: page.html }} />;
}
