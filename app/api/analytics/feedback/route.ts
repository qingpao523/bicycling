import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await request.json();
    const { type, title, description, priority, pagePath } = body;

    if (!title || !description || !type || !priority) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (title.length > 100) {
      return NextResponse.json({ error: "Title too long" }, { status: 400 });
    }

    if (description.length > 2000) {
      return NextResponse.json({ error: "Description too long" }, { status: 400 });
    }

    // For now, store in a simple JSON file since we haven't added the Feedback model to Prisma yet
    const fs = await import("fs/promises");
    const path = await import("path");
    const feedbackDir = path.join(process.cwd(), "data", "feedback");
    await fs.mkdir(feedbackDir, { recursive: true });

    const feedback = {
      id: crypto.randomUUID(),
      userId: user.id,
      type,
      title,
      description,
      priority,
      status: "submitted",
      pagePath: pagePath ?? null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const filePath = path.join(feedbackDir, `${feedback.id}.json`);
    await fs.writeFile(filePath, JSON.stringify(feedback, null, 2));

    return NextResponse.json({ success: true, id: feedback.id });
  } catch (error) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
