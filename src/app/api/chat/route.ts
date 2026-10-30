import { handlers } from '../../../lib/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = (req: Request) => handlers.chat(req);
export const OPTIONS = (req: Request) => handlers.options(req);
