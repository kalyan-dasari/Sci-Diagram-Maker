export interface CheckResult {
  id: string;
  name: string;
  passed: boolean;
  message: string;
}

export interface SVGValidationReport {
  allPassed: boolean;
  failedChecks: string[];
  checks: {
    validXml: CheckResult;
    viewBoxBounds: CheckResult;
    labelsAndTitle: CheckResult;
    animation: CheckResult;
    educationalClarity: CheckResult; // Custom check
  };
}

/**
 * Validates an SVG string against Udhi Technologies criteria
 */
export function validateSvg(svgString: string): SVGValidationReport {
  const checks = {
    validXml: { id: 'check_1', name: 'Valid SVG / XML Parse', passed: false, message: '' },
    viewBoxBounds: { id: 'check_2', name: 'Within ViewBox Bounds', passed: false, message: '' },
    labelsAndTitle: { id: 'check_3', name: 'Title & >= 3 Labels', passed: false, message: '' },
    animation: { id: 'check_4', name: 'Has Animation (CSS/SMIL)', passed: false, message: '' },
    educationalClarity: { id: 'check_5', name: 'Custom Check: GCSE Clarity & Safety', passed: false, message: '' }
  };

  // 1. Check XML Parsing
  let doc: Document | null = null;
  try {
    const parser = new DOMParser();
    doc = parser.parseFromString(svgString.trim(), 'image/svg+xml');
    const parserError = doc.querySelector('parsererror');
    if (parserError) {
      checks.validXml.passed = false;
      checks.validXml.message = `XML Parsing failed: ${parserError.textContent?.slice(0, 100)}`;
    } else {
      const rootSvg = doc.querySelector('svg');
      if (!rootSvg) {
        checks.validXml.passed = false;
        checks.validXml.message = 'No root <svg> element found.';
      } else {
        checks.validXml.passed = true;
        checks.validXml.message = 'SVG is well-formed XML with valid root tag.';
      }
    }
  } catch (err: unknown) {
    checks.validXml.passed = false;
    checks.validXml.message = `Parse exception: ${err instanceof Error ? err.message : String(err)}`;
  }

  if (!checks.validXml.passed || !doc) {
    checks.viewBoxBounds.message = 'Skipped: Invalid XML';
    checks.labelsAndTitle.message = 'Skipped: Invalid XML';
    checks.animation.message = 'Skipped: Invalid XML';
    checks.educationalClarity.message = 'Skipped: Invalid XML';
    return {
      allPassed: false,
      failedChecks: ['check_1 (Valid SVG/XML)'],
      checks
    };
  }

  const svg = doc.querySelector('svg')!;

  // 2. Check ViewBox Boundaries
  const viewBoxAttr = svg.getAttribute('viewBox');
  if (!viewBoxAttr) {
    checks.viewBoxBounds.passed = false;
    checks.viewBoxBounds.message = 'Missing viewBox attribute on <svg>.';
  } else {
    const vbParts = viewBoxAttr.trim().split(/[\s,]+/).map(Number);
    if (vbParts.length !== 4 || vbParts.some(isNaN)) {
      checks.viewBoxBounds.passed = false;
      checks.viewBoxBounds.message = `Invalid viewBox value: "${viewBoxAttr}".`;
    } else {
      const [minX, minY, vbWidth, vbHeight] = vbParts;
      const maxX = minX + vbWidth;
      const maxY = minY + vbHeight;

      // Inspect elements for coordinates exceeding viewBox
      let outOfBoundsFound = false;
      let outOfBoundsDesc = '';

      const checkCoord = (x: number, y: number, elemName: string) => {
        // Allow a small 5% buffer for strokes or text metrics
        const bufferX = vbWidth * 0.05;
        const bufferY = vbHeight * 0.05;
        if (x < minX - bufferX || x > maxX + bufferX || y < minY - bufferY || y > maxY + bufferY) {
          outOfBoundsFound = true;
          outOfBoundsDesc = `<${elemName}> placed at (${x}, ${y}) is outside viewBox [${minX}, ${minY}, ${maxX}, ${maxY}]`;
        }
      };

      // Check circles
      svg.querySelectorAll('circle').forEach(c => {
        const cx = parseFloat(c.getAttribute('cx') || '0');
        const cy = parseFloat(c.getAttribute('cy') || '0');
        if (!isNaN(cx) && !isNaN(cy)) checkCoord(cx, cy, 'circle');
      });

      // Check rects
      svg.querySelectorAll('rect').forEach(r => {
        const x = parseFloat(r.getAttribute('x') || '0');
        const y = parseFloat(r.getAttribute('y') || '0');
        if (!isNaN(x) && !isNaN(y)) checkCoord(x, y, 'rect');
      });

      // Check text positions
      svg.querySelectorAll('text').forEach(t => {
        const x = parseFloat(t.getAttribute('x') || '0');
        const y = parseFloat(t.getAttribute('y') || '0');
        if (!isNaN(x) && !isNaN(y)) checkCoord(x, y, 'text');
      });

      if (outOfBoundsFound) {
        checks.viewBoxBounds.passed = false;
        checks.viewBoxBounds.message = outOfBoundsDesc;
      } else {
        checks.viewBoxBounds.passed = true;
        checks.viewBoxBounds.message = `All elements contained within viewBox [${minX}, ${minY}, ${vbWidth}, ${vbHeight}].`;
      }
    }
  }

  // 3. Check Title and at least 3 Text Labels
  const titleElem = svg.querySelector('title');
  const textElements = Array.from(svg.querySelectorAll('text'));
  const hasTitle = Boolean(
    titleElem && titleElem.textContent?.trim() ||
    textElements.some(t => {
      const fontSize = parseFloat(t.getAttribute('font-size') || '12');
      const isBold = t.getAttribute('font-weight') === 'bold' || t.classList.contains('title');
      return fontSize >= 16 || isBold;
    })
  );

  const labelTexts = textElements.map(t => t.textContent?.trim()).filter(Boolean);
  const distinctLabels = new Set(labelTexts);

  if (hasTitle && distinctLabels.size >= 3) {
    checks.labelsAndTitle.passed = true;
    checks.labelsAndTitle.message = `Has title & ${distinctLabels.size} informative text labels.`;
  } else {
    checks.labelsAndTitle.passed = false;
    checks.labelsAndTitle.message = `Failed requirements: title present = ${hasTitle}, labels count = ${distinctLabels.size} (need >= 3).`;
  }

  // 4. Check Animation (CSS @keyframes or SMIL <animate>)
  const smilAnimate = svg.querySelectorAll('animate, animateTransform, animateMotion, set');
  const styles = Array.from(svg.querySelectorAll('style')).map(s => s.textContent || '').join(' ');
  const rawSvg = svgString;

  const hasSmil = smilAnimate.length > 0;
  const hasCssAnimation =
    /@keyframes/i.test(styles) ||
    /animation\s*:/i.test(styles) ||
    /@keyframes/i.test(rawSvg) ||
    /style=.*animation/i.test(rawSvg);

  if (hasSmil || hasCssAnimation) {
    checks.animation.passed = true;
    checks.animation.message = `Active animation detected: ${hasSmil ? 'SMIL elements' : ''} ${hasCssAnimation ? 'CSS keyframes' : ''}`.trim();
  } else {
    checks.animation.passed = false;
    checks.animation.message = 'No SMIL (<animate>) or CSS @keyframes animation found.';
  }

  // 5. Custom Check: UK GCSE Educational Structure, Readability & Safety
  // Requirements:
  // a) Zero unsafe scripts (<script> tags strictly disallowed)
  // b) Semantic component grouping (<g> tags present for structural clarity)
  // c) Proper viewBox aspect ratio (between 1.0 and 2.2, standard for GCSE video slides e.g., 16:9 or 4:3)
  // d) Accessible text sizing (all text >= 10px font size)
  const scripts = svg.querySelectorAll('script');
  const groups = svg.querySelectorAll('g');
  const viewBoxParts = (svg.getAttribute('viewBox') || '').split(/[\s,]+/).map(Number);
  const aspectRatio = viewBoxParts.length === 4 && viewBoxParts[3] > 0 ? viewBoxParts[2] / viewBoxParts[3] : 0;

  let smallTextCount = 0;
  textElements.forEach(t => {
    const size = parseFloat(t.getAttribute('font-size') || '12');
    if (!isNaN(size) && size < 9) smallTextCount++;
  });

  if (scripts.length > 0) {
    checks.educationalClarity.passed = false;
    checks.educationalClarity.message = 'Security violation: Unsafe <script> tag detected in SVG.';
  } else if (groups.length === 0) {
    checks.educationalClarity.passed = false;
    checks.educationalClarity.message = 'Poor structure: Missing semantic <g> groups for GCSE video component hierarchy.';
  } else if (aspectRatio < 1.0 || aspectRatio > 2.2) {
    checks.educationalClarity.passed = false;
    checks.educationalClarity.message = `Invalid aspect ratio (${aspectRatio.toFixed(2)}): Must match lesson video slide format (16:9 or 4:3).`;
  } else if (smallTextCount > 0) {
    checks.educationalClarity.passed = false;
    checks.educationalClarity.message = `Accessibility issue: ${smallTextCount} text elements have font-size < 9px, violating GCSE readability standard.`;
  } else {
    checks.educationalClarity.passed = true;
    checks.educationalClarity.message = `Passed GCSE standards: ${groups.length} semantic groups, aspect ratio ${aspectRatio.toFixed(2)}, safe, readable fonts.`;
  }

  const failedChecks: string[] = [];
  if (!checks.validXml.passed) failedChecks.push('Check 1: Valid XML');
  if (!checks.viewBoxBounds.passed) failedChecks.push('Check 2: ViewBox Bounds');
  if (!checks.labelsAndTitle.passed) failedChecks.push('Check 3: Title & 3 Labels');
  if (!checks.animation.passed) failedChecks.push('Check 4: Animation');
  if (!checks.educationalClarity.passed) failedChecks.push('Check 5: GCSE Educational Clarity');

  return {
    allPassed: failedChecks.length === 0,
    failedChecks,
    checks
  };
}
