import { NextResponse } from 'next/server';

const INSTALL_SCRIPT_URL = 'https://raw.githubusercontent.com/KirillBaranov/kb-labs-dev/main/install.sh';

export function GET() {
  return NextResponse.redirect(INSTALL_SCRIPT_URL, { status: 307 });
}
