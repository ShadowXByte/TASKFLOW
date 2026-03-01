import { compare, hash } from "bcryptjs";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    currentPassword?: string;
    newPassword?: string;
  };

  const currentPassword = body.currentPassword?.trim();
  const newPassword = body.newPassword?.trim();

  if (!currentPassword || !newPassword || newPassword.length < 6) {
    return NextResponse.json(
      { message: "Current password and new password (min 6 chars) are required." },
      { status: 400 },
    );
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

  const samePassword = await compare(newPassword, user.password);
  if (samePassword) {
    return NextResponse.json({ message: "New password must be different." }, { status: 400 });
  }

  const passwordHash = await hash(newPassword, 10);

  await prisma.user.update({
    where: { id: user.id },
    data: { password: passwordHash },
  });

  return NextResponse.json({ message: "Password updated successfully." });
}
