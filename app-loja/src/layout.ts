import { useWindowDimensions } from 'react-native';

// Um app só, três jeitos: celular (em pé), tablet em pé e tablet deitado.
export type Layout = 'phone' | 'tabletPortrait' | 'tabletLandscape';

export function useLayout(): { layout: Layout; isTablet: boolean; width: number } {
  const { width, height } = useWindowDimensions();
  const isTablet = Math.min(width, height) >= 600;
  const layout: Layout = !isTablet ? 'phone' : width > height ? 'tabletLandscape' : 'tabletPortrait';
  return { layout, isTablet, width };
}
