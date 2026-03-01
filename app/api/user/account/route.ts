import { compare } from "bcryptjs";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function DELETE(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    currentPassword?: string;
  };

  const currentPassword = body.currentPassword?.trim();
  if (!currentPassword) {
    return NextResponse.json({ message: "Current password is required." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, password: true },
  });

  if (!user) {
    return NextResponse.json({ message: "User not found." }, { status: 404 });
  }

  const matches = await compare(currentPassword, user.password);
  if (!matches) {
    return NextResponse.json({ message: "Current password is incorrect." }, { status: 400 });
  }

  await prisma.user.delete({ where: { id: user.id } });

  return NextResponse.json({ message: "Account deleted successfully." });
}
