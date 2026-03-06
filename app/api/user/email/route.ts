import { compare } from "bcryptjs";
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
    newEmail?: string;
    currentPassword?: string;
  };

  const newEmail = body.newEmail?.trim().toLowerCase();
  const currentPassword = body.currentPassword?.trim();

  if (!newEmail || !currentPassword) {
    return NextResponse.json({ message: "New email and current password are required." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, password: true, email: true },
  });

  if (!user) {
    return NextResponse.json({ message: "User not found." }, { status: 404 });
  }

  const matches = await compare(currentPassword, user.password);
  if (!matches) {
    return NextResponse.json({ message: "Current password is incorrect." }, { status: 400 });
  }

  if (user.email?.toLowerCase() === newEmail) {
    return NextResponse.json({ message: "New email must be different." }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { email: newEmail }, select: { id: true } });
  if (existing && existing.id !== user.id) {
    return NextResponse.json({ message: "An account with this email already exists." }, { status: 409 });
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { email: newEmail },
    select: {
      id: true,
      email: true,
      name: true,
    },
  });

  return NextResponse.json({ message: "Email updated successfully.", user: updated });
}
