import { NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      name?: string;
      email?: string;
      password?: string;
    };

    const name = body.name?.trim() || null;
    const email = body.email?.trim().toLowerCase();
    const password = body.password?.trim();

    if (!email || !password || password.length < 6) {
      return NextResponse.json(
        { message: "Email and password (min 6 chars) are required." },
        { status: 400 },
      );
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json(
        { message: "An account with this email already exists." },
        { status: 409 },
      );
    }

    const passwordHash = await hash(password, 10);

    await prisma.user.create({
      data: {
        name,
        email,
        password: passwordHash,
      },
    });

    return NextResponse.json({ message: "Account created successfully." }, { status: 201 });
  } catch (error) {
    console.error("Registration error:", error);
    const message = error instanceof Error ? error.message : "Unable to create account.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
