import { NextResponse } from 'next/server';
import { readdir, readFile, writeFile } from 'fs/promises';
import { join } from 'path';

/**
 * One-time repair endpoint that replaces broken blob: URLs in project configs
 * with real /uploads/... paths by matching filenames.
 *
 * GET /api/maps/repair
 */
export async function GET() {
  try {
    const mapsDir = join(process.cwd(), 'public', 'maps');
    const uploadsDir = join(process.cwd(), 'public', 'uploads');

    // 1. List all uploaded files and index them by base name (without timestamp prefix)
    const uploadFiles = await readdir(uploadsDir);

    // Group uploaded files by their base name (after the timestamp- prefix)
    // e.g. "1772503519099-1-bedroom-house-plan.jpg" → baseName "1-bedroom-house-plan.jpg"
    const filesByBaseName = new Map<string, string[]>();
    for (const f of uploadFiles) {
      const dashIdx = f.indexOf('-');
      if (dashIdx === -1) continue;
      const baseName = f.substring(dashIdx + 1); // "1-bedroom-house-plan.jpg"
      if (!filesByBaseName.has(baseName)) filesByBaseName.set(baseName, []);
      filesByBaseName.get(baseName)!.push(f);
    }

    // Sort each group so the latest upload is last
    for (const [, files] of filesByBaseName) {
      files.sort();
    }

    // Also index by name-without-extension for matching against sub-map names
    // e.g. "1-bedroom-house-plan" → ["/uploads/1772503519099-1-bedroom-house-plan.jpg"]
    const filesByNameNoExt = new Map<string, string>();
    for (const [baseName, files] of filesByBaseName) {
      const nameNoExt = baseName.replace(/\.[^.]+$/, '');
      // Use the latest file for each name
      filesByNameNoExt.set(nameNoExt.toLowerCase(), `/uploads/${files[files.length - 1]}`);
    }

    // 2. Process each project
    const projectDirs = await readdir(mapsDir, { withFileTypes: true });
    const results: { id: string; name: string; fixed: number; errors: string[] }[] = [];

    for (const entry of projectDirs) {
      if (!entry.isDirectory()) continue;
      const configPath = join(mapsDir, entry.name, 'config.json');

      let raw: string;
      try {
        raw = await readFile(configPath, 'utf-8');
      } catch {
        continue; // skip non-project dirs
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let project: any;
      try {
        project = JSON.parse(raw);
      } catch {
        continue;
      }

      let fixCount = 0;
      const errors: string[] = [];

      // Helper: find the best matching upload path for a given image name
      const findUploadPath = (name: string): string | null => {
        // Try exact match (case-insensitive)
        const lowerName = name.toLowerCase();
        if (filesByNameNoExt.has(lowerName)) {
          return filesByNameNoExt.get(lowerName)!;
        }
        // Try partial match — search for uploaded files whose base name contains the image name
        for (const [key, path] of filesByNameNoExt) {
          if (key.includes(lowerName) || lowerName.includes(key)) {
            return path;
          }
        }
        return null;
      };

      // Fix master map imageUrl
      if (project.masterMap?.imageUrl?.startsWith('blob:')) {
        // The master map is the image NOT used by any sub-map
        // Collect sub-map names to exclude
        const subMapNames = new Set<string>();
        for (const sm of (project.subMaps || [])) {
          subMapNames.add(sm.name?.toLowerCase());
        }

        // Find the uploaded image that doesn't match any sub-map name
        let masterPath: string | null = null;
        for (const [nameNoExt, path] of filesByNameNoExt) {
          if (!subMapNames.has(nameNoExt)) {
            masterPath = path;
            break;
          }
        }

        if (masterPath) {
          project.masterMap.imageUrl = masterPath;
          fixCount++;
        } else {
          errors.push('Could not find master map image in uploads');
        }
      }

      // Fix sub-map floor imageUrls
      for (const subMap of (project.subMaps || [])) {
        for (const floor of (subMap.floors || [])) {
          if (floor.imageUrl?.startsWith('blob:')) {
            const uploadPath = findUploadPath(subMap.name);
            if (uploadPath) {
              floor.imageUrl = uploadPath;
              fixCount++;
            } else {
              errors.push(`Could not find image for sub-map "${subMap.name}"`);
            }
          }
        }
      }

      if (fixCount > 0) {
        project.updatedAt = new Date().toISOString();
        await writeFile(configPath, JSON.stringify(project, null, 2));
      }

      results.push({
        id: project.id,
        name: project.name || entry.name,
        fixed: fixCount,
        errors,
      });
    }

    const totalFixed = results.reduce((sum, r) => sum + r.fixed, 0);
    return NextResponse.json({
      success: true,
      message: `Repaired ${totalFixed} broken image URLs across ${results.length} projects`,
      results,
    });
  } catch (error) {
    console.error('Repair error:', error);
    return NextResponse.json({ error: 'Repair failed', details: String(error) }, { status: 500 });
  }
}
