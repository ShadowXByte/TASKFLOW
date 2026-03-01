import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getVapidPublicKey, isPushConfigured } from "@/lib/push";

const prismaClient = prisma as unknown as {
  pushSubscription: {
    upsert: (args: unknown) => Promise<unknown>;
    deleteMany: (args: unknown) => Promise<unknown>;
  };
};

type SubscribeBody = {
  endpoint?: string;
  keys?: {
    p256dh?: string;
    auth?: string;
  };
};

export async function GET() {
  return NextResponse.json({
    configured: isPushConfigured(),
    vapidPublicKey: getVapidPublicKey(),
  });
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as SubscribeBody;
  const endpoint = body.endpoint?.trim();
  const p256dh = body.keys?.p256dh?.trim();
  const auth = body.keys?.auth?.trim();

  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ message: "Invalid push subscription payload." }, { status: 400 });
  }

  await prismaClient.pushSubscription.upsert({
    where: { endpoint },
    update: {
      p256dh,
      auth,
      userId: session.user.id,
    },
    create: {
      endpoint,
      p256dh,
      auth,
      userId: session.user.id,
    },
  });

  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as { endpoint?: string };
  const endpoint = body.endpoint?.trim();

  if (!endpoint) {
    return NextResponse.json({ message: "Endpoint is required." }, { status: 400 });
  }

  await prismaClient.pushSubscription.deleteMany({
    where: {
      endpoint,
      userId: session.user.id,
    },
  });

  return NextResponse.json({ success: true });
}
