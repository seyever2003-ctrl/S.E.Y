import { useState, useCallback, useRef } from 'react';

/**
 * Predefined anchor positions as percentage (left%, top%) so the center of the
 * image lands at that point within the container.
 */
export const PRESET_POSITIONS = {
  'top-left':      { x: 10, y: 10 },
  'top-right':     { x: 90, y: 10 },
  'bottom-left':   { x: 10, y: 90 },
  'bottom-right':  { x: 90, y: 90 },
  'center':        { x: 50, y: 50 },
};

/** Tolerance (percentage points) to consider a coordinate "at" a preset */
const PRESET_TOLERANCE = 3;

/**
 * Return the preset key whose (x, y) is closest to the given values,
 * or 'custom' if none are within tolerance.
 */
function nearestPreset(x, y) {
  let best = 'custom';
  let bestDist = Infinity;
  for (const [key, pos] of Object.entries(PRESET_POSITIONS)) {
    const dist = Math.hypot(pos.x - x, pos.y - y);
    if (dist < bestDist) {
      bestDist = dist;
      best = dist <= PRESET_TOLERANCE ? key : 'custom';
    }
  }
  return best;
}

/**
 * useLogoOverlay — manages state for a logo/image overlay on the video preview.
 *
 * Exposes:
 *  - logoFile / logoPreviewUrl: the uploaded image
 *  - logoX / logoY: percentage (0-100) anchor point within the container
 *  - logoPosition: derived preset key ('custom' when dragged off-preset)
 *  - logoSize: percentage of container width (5–50)
 *  - logoVisible: toggle show/hide
 *  - logoOpacity: 0–1
 *  - handlers for upload, clear, visibility toggle, setPosition
 */
export default function useLogoOverlay() {
  const [logoFile, setLogoFile] = useState(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState(null);
  const [logoX, setLogoX] = useState(90);    // bottom-right default
  const [logoY, setLogoY] = useState(90);
  const [logoSize, setLogoSize] = useState(8); // percentage of container
  const [logoVisible, setLogoVisible] = useState(true);
  const [logoOpacity, setLogoOpacity] = useState(0.85);

  const prevUrlRef = useRef(null);

  /** Derived preset key */
  const logoPosition = nearestPreset(logoX, logoY);

  /** Upload a new logo image */
  const handleLogoUpload = useCallback((file) => {
    if (!file) return;
    // Revoke previous URL to avoid memory leaks
    if (prevUrlRef.current) {
      URL.revokeObjectURL(prevUrlRef.current);
    }
    const url = URL.createObjectURL(file);
    prevUrlRef.current = url;
    setLogoFile(file);
    setLogoPreviewUrl(url);
    setLogoVisible(true);
  }, []);

  /** Clear the logo entirely */
  const clearLogo = useCallback(() => {
    if (prevUrlRef.current) {
      URL.revokeObjectURL(prevUrlRef.current);
      prevUrlRef.current = null;
    }
    setLogoFile(null);
    setLogoPreviewUrl(null);
    setLogoVisible(false);
  }, []);

  /** Toggle visibility without losing the image */
  const toggleLogoVisibility = useCallback(() => {
    setLogoVisible((prev) => !prev);
  }, []);

  /** Set position to a named preset */
  const setLogoPosition = useCallback((key) => {
    const pos = PRESET_POSITIONS[key];
    if (pos) {
      setLogoX(pos.x);
      setLogoY(pos.y);
    }
  }, []);

  /** Set X/Y position directly (e.g. from drag) */
  const setLogoPositionCustom = useCallback((x, y) => {
    setLogoX(Math.max(0, Math.min(100, x)));
    setLogoY(Math.max(0, Math.min(100, y)));
  }, []);

  /** Cleanup on unmount (caller should invoke this) */
  const cleanup = useCallback(() => {
    if (prevUrlRef.current) {
      URL.revokeObjectURL(prevUrlRef.current);
      prevUrlRef.current = null;
    }
  }, []);

  return {
    logoFile,
    logoPreviewUrl,
    logoX,
    logoY,
    logoPosition,
    logoSize,
    logoVisible,
    logoOpacity,
    setLogoPosition,
    setLogoPositionCustom,
    setLogoSize,
    setLogoOpacity,
    handleLogoUpload,
    clearLogo,
    toggleLogoVisibility,
    cleanup,
  };
}
