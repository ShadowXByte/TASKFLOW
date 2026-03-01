import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      name: true,
      email: true,
    },
  });

  return NextResponse.json(user);
}

export async function PATCH(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    name?: string;
    dateOfBirth?: string | null;
  };

  const data: {
    name?: string | null;
    dateOfBirth?: Date | null;
  } = {};

  if (typeof body.name === "string") {
    const cleanName = body.name.trim();
    data.name = cleanName || null;
  }

  if (body.dateOfBirth === null) {
    data.dateOfBirth = null;
  } else if (typeof body.dateOfBirth === "string") {
    const cleanDob = body.dateOfBirth.trim();
    if (!cleanDob) {
      data.dateOfBirth = null;
    } else {
      const parsed = new Date(`${cleanDob}T00:00:00`);
      if (Number.isNaN(parsed.getTime())) {
        return NextResponse.json({ message: "Invalid date of birth." }, { status: 400 });
      }
      data.dateOfBirth = parsed;
    }
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ message: "No valid fields provided." }, { status: 400 });
  }

  const updated = await prisma.user.update({
    where: { id: session.user.id },
    data,
    select: {
      id: true,
      name: true,
      email: true,
    },
  });

  return NextResponse.json(updated);
}
