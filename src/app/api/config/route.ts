import { handlers } from '../../../lib/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = (req: Request) => handlers.config(req);
export const OPTIONS = (req: Request) => handlers.options(req);
