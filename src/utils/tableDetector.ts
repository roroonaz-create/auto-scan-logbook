import sharp from "sharp";

export interface BoundingBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  width: number;
  height: number;
}

export interface DetectedRow {
  rowIndex: number;
  y1: number;
  y2: number;
  height: number;
  dataPembandingBox: BoundingBox;
}

export interface TableStructureResult {
  imageWidth: number;
  imageHeight: number;
  tableBox: BoundingBox;
  rowCount: number;
  columnCount: number;
  dataPembandingColumn: {
    x1: number;
    x2: number;
    width: number;
  };
  rows: DetectedRow[];
}

/**
 * Deterministic Table & Row/Column Detector using Sharp computer vision
 * Performs:
 * 1. Image grayscale & adaptive thresholding
 * 2. Morphological horizontal line detection (finding row dividers)
 * 3. Morphological vertical line detection (finding column dividers)
 * 4. Cell region extraction with anti-bleed padding to eliminate gridline '+' bleeding
 */
export async function detectTableStructure(
  imageBuffer: Buffer
): Promise<TableStructureResult> {
  const metadata = await sharp(imageBuffer).metadata();
  const imageWidth = metadata.width || 1000;
  const imageHeight = metadata.height || 1000;

  // Analysis dimensions (standardized scale for fast deterministic analysis)
  const maxDim = 1200;
  const scale = Math.min(1.0, maxDim / Math.max(imageWidth, imageHeight));
  const procW = Math.max(100, Math.round(imageWidth * scale));
  const procH = Math.max(100, Math.round(imageHeight * scale));

  const rawGray = await sharp(imageBuffer)
    .resize(procW, procH, { fit: "fill" })
    .grayscale()
    .raw()
    .toBuffer();

  // 1. Calculate Adaptive Threshold
  let sum = 0;
  for (let i = 0; i < rawGray.length; i++) {
    sum += rawGray[i];
  }
  const meanBrightness = sum / rawGray.length;
  const darkThreshold = Math.max(70, Math.min(190, meanBrightness * 0.82));

  // 2. Horizontal Line Detection via Horizontal Morphological Profile
  const hScores = new Float32Array(procH);
  const minHRun = Math.max(10, Math.round(procW * 0.18)); // at least 18% continuous dark run

  for (let y = 0; y < procH; y++) {
    let currentRun = 0;
    let maxRun = 0;
    let darkCount = 0;
    const rowOffset = y * procW;
    for (let x = 0; x < procW; x++) {
      if (rawGray[rowOffset + x] < darkThreshold) {
        currentRun++;
        darkCount++;
        if (currentRun > maxRun) maxRun = currentRun;
      } else {
        currentRun = 0;
      }
    }
    const darkRatio = darkCount / procW;
    const maxRunRatio = maxRun / procW;
    if (maxRun >= minHRun || darkRatio > 0.3) {
      hScores[y] = darkRatio * 0.4 + maxRunRatio * 0.6;
    }
  }

  // Find Horizontal Peaks (Row Dividers)
  const rawHPeaks: number[] = [];
  const minRowGap = Math.max(8, Math.round(procH * 0.018)); // minimum height between rows

  for (let y = 1; y < procH - 1; y++) {
    if (hScores[y] > 0.08 && hScores[y] >= hScores[y - 1] && hScores[y] >= hScores[y + 1]) {
      if (rawHPeaks.length === 0 || y - rawHPeaks[rawHPeaks.length - 1] >= minRowGap) {
        rawHPeaks.push(y);
      } else {
        const prevY = rawHPeaks[rawHPeaks.length - 1];
        if (hScores[y] > hScores[prevY]) {
          rawHPeaks[rawHPeaks.length - 1] = y;
        }
      }
    }
  }

  // 3. Vertical Line Detection via Vertical Morphological Profile
  const vScores = new Float32Array(procW);
  const minVRun = Math.max(10, Math.round(procH * 0.15));

  for (let x = 0; x < procW; x++) {
    let currentRun = 0;
    let maxRun = 0;
    let darkCount = 0;
    for (let y = 0; y < procH; y++) {
      if (rawGray[y * procW + x] < darkThreshold) {
        currentRun++;
        darkCount++;
        if (currentRun > maxRun) maxRun = currentRun;
      } else {
        currentRun = 0;
      }
    }
    const darkRatio = darkCount / procH;
    const maxRunRatio = maxRun / procH;
    if (maxRun >= minVRun || darkRatio > 0.25) {
      vScores[x] = darkRatio * 0.4 + maxRunRatio * 0.6;
    }
  }

  const rawVPeaks: number[] = [];
  const minColGap = Math.max(15, Math.round(procW * 0.025));

  for (let x = 1; x < procW - 1; x++) {
    if (vScores[x] > 0.06 && vScores[x] >= vScores[x - 1] && vScores[x] >= vScores[x + 1]) {
      if (rawVPeaks.length === 0 || x - rawVPeaks[rawVPeaks.length - 1] >= minColGap) {
        rawVPeaks.push(x);
      } else {
        const prevX = rawVPeaks[rawVPeaks.length - 1];
        if (vScores[x] > vScores[prevX]) {
          rawVPeaks[rawVPeaks.length - 1] = x;
        }
      }
    }
  }

  // Map analyzed peaks back to original image scale
  const origHPeaks = rawHPeaks.map((y) => Math.round(y / scale));
  const origVPeaks = rawVPeaks.map((x) => Math.round(x / scale));

  // Determine Table Boundaries
  let tableY1 = 0;
  let tableY2 = imageHeight;
  let tableX1 = 0;
  let tableX2 = imageWidth;

  if (origHPeaks.length >= 2) {
    tableY1 = origHPeaks[0];
    tableY2 = origHPeaks[origHPeaks.length - 1];
  }

  if (origVPeaks.length >= 2) {
    tableX1 = origVPeaks[0];
    tableX2 = origVPeaks[origVPeaks.length - 1];
  }

  const tableWidth = Math.max(10, tableX2 - tableX1);
  const tableHeight = Math.max(10, tableY2 - tableY1);

  // 4. Determine 10 Table Columns & DATA PEMBANDING position
  // The 10 standard columns of manufacturing logbook:
  // 0: TANGGAL, 1: JAM_IN, 2: JAM_OUT, 3: DATA_PEMBANDING, 4: COSTUMER,
  // 5: MODEL, 6: PART_NUMBER, 7: PIC, 8: REMARK, 9: OPERATOR
  // Proportions of columns relative to table width:
  // [0.08, 0.06, 0.06, 0.13, 0.11, 0.14, 0.14, 0.09, 0.12, 0.07]
  const defaultColFractions = [0, 0.08, 0.14, 0.20, 0.33, 0.44, 0.58, 0.72, 0.81, 0.93, 1.0];

  let colBoundaries: number[] = [];
  if (origVPeaks.length >= 11) {
    // Exact 11 vertical divider lines detected
    colBoundaries = origVPeaks.slice(0, 11);
  } else {
    // Calculate deterministic column boundaries from table outer bounding box
    colBoundaries = defaultColFractions.map((frac) =>
      Math.round(tableX1 + frac * tableWidth)
    );
  }

  // Data Pembanding is Column Index 3 (between colBoundaries[3] and colBoundaries[4])
  const dpColX1 = colBoundaries[3];
  const dpColX2 = colBoundaries[4];
  const dpColWidth = Math.max(10, dpColX2 - dpColX1);

  // 5. Determine Rows
  // If at least 3 horizontal lines are detected, use the detected row intervals.
  // The first interval (H[0] to H[1]) is usually the table header ("DATA PEMBANDING", "JAM IN", etc.)
  let rowDividers: number[] = [];
  if (origHPeaks.length >= 4) {
    // Skip the header row (between H[0] and H[1]), data rows start from H[1]
    rowDividers = origHPeaks.slice(1);
  } else {
    // If faint lines prevented multi-line peak detection, synthesize deterministic rows
    // Standard logbook page has ~18-24 rows
    const assumedRows = 20;
    const headerH = Math.round(tableHeight * 0.06);
    const dataH = tableHeight - headerH;
    const rowH = dataH / assumedRows;
    rowDividers = [];
    for (let i = 0; i <= assumedRows; i++) {
      rowDividers.push(Math.round(tableY1 + headerH + i * rowH));
    }
  }

  // 6. Build Detected Rows & Clean Anti-Bleed Cell Crops
  // Inset padding: 8% horizontal inset away from vertical grid lines (eliminating '+', '|' and border bleed)
  // 8% vertical inset away from horizontal lines
  const insetX = Math.max(3, Math.round(dpColWidth * 0.08));

  const rows: DetectedRow[] = [];
  for (let i = 0; i < rowDividers.length - 1; i++) {
    const y1 = rowDividers[i];
    const y2 = rowDividers[i + 1];
    const rowHeight = y2 - y1;
    if (rowHeight < 8) continue; // skip degenerate rows

    const insetY = Math.max(2, Math.round(rowHeight * 0.08));

    // Cell crop coordinates with anti-bleed padding
    const cellX1 = Math.min(imageWidth - 5, dpColX1 + insetX);
    const cellX2 = Math.max(cellX1 + 5, dpColX2 - insetX);
    const cellY1 = Math.min(imageHeight - 5, y1 + insetY);
    const cellY2 = Math.max(cellY1 + 5, y2 - insetY);

    rows.push({
      rowIndex: rows.length + 1,
      y1,
      y2,
      height: rowHeight,
      dataPembandingBox: {
        x1: cellX1,
        y1: cellY1,
        x2: cellX2,
        y2: cellY2,
        width: cellX2 - cellX1,
        height: cellY2 - cellY1,
      },
    });
  }

  return {
    imageWidth,
    imageHeight,
    tableBox: {
      x1: tableX1,
      y1: tableY1,
      x2: tableX2,
      y2: tableY2,
      width: tableWidth,
      height: tableHeight,
    },
    rowCount: rows.length,
    columnCount: 10,
    dataPembandingColumn: {
      x1: dpColX1,
      x2: dpColX2,
      width: dpColWidth,
    },
    rows,
  };
}
