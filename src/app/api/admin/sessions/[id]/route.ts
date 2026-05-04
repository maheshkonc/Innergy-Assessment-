import { prisma } from "@/db/client";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyAdminCookie } from "@/core/auth/admin-session";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Security check: Only admins
  const sessionCookie = (await cookies()).get("innergy_admin")?.value;
  if (!sessionCookie || !verifyAdminCookie(sessionCookie)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  try {
    // Delete associated data that might not be cascading properly in the schema
    await prisma.$transaction([
      prisma.notification.deleteMany({ where: { sessionId: id } }),
      prisma.event.deleteMany({ where: { sessionId: id } }),
      prisma.session.delete({ where: { id } }),
    ]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[SESSION_DELETE]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
