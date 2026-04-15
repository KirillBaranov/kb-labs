import { NextResponse } from 'next/server';

const INSTALL_SCRIPT_URL = 'https://raw.githubusercontent.com/KirillBaranov/kb-labs/main/tools/kb-create/install.ps1';

export function GET() {
  return NextResponse.redirect(INSTALL_SCRIPT_URL, { status: 307 });
}
