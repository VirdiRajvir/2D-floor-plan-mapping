import { NextRequest, NextResponse } from 'next/server';
import { extractFloorPlanOutline, renderOutlineToSVG } from '@/lib/floorplanExtractor';

export const maxDuration = 120; // Allow up to 2 minutes for multi-pass extraction

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const imageFile = formData.get('image') as File | null;
    const apiKey = formData.get('apiKey') as string | null;
    const outputWidth = parseInt(formData.get('outputWidth') as string) || 900;
    const outputHeight = parseInt(formData.get('outputHeight') as string) || 750;
    const passes = parseInt(formData.get('passes') as string) || 2;
    const format = (formData.get('format') as string) || 'both'; // 'svg', 'json', 'both'

    if (!imageFile) {
      return NextResponse.json({ error: 'No image file provided' }, { status: 400 });
    }

    if (!apiKey) {
      return NextResponse.json({ error: 'OpenAI API key is required' }, { status: 400 });
    }

    // Validate image type
    const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'];
    if (!validTypes.includes(imageFile.type)) {
      return NextResponse.json(
        { error: `Invalid image type: ${imageFile.type}. Supported: PNG, JPG, WebP, GIF` },
        { status: 400 }
      );
    }

    // Read image to buffer
    const arrayBuffer = await imageFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Extract floor plan outline
    const outline = await extractFloorPlanOutline(buffer, imageFile.type, {
      apiKey,
      outputWidth,
      outputHeight,
      passes: Math.min(3, Math.max(1, passes)),
    });

    // Build response based on requested format
    const response: Record<string, unknown> = { success: true };

    if (format === 'json' || format === 'both') {
      response.outline = outline;
    }

    if (format === 'svg' || format === 'both') {
      response.svg = renderOutlineToSVG(outline);
    }

    response.stats = {
      walls: outline.walls.length,
      obstacles: outline.obstacles.length,
      boundaryPoints: outline.outerBoundary.length,
      dimensions: { width: outline.width, height: outline.height },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Floor plan extraction error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Extraction failed' },
      { status: 500 }
    );
  }
}
