import React, { useState, useEffect } from 'react';
import { getImage } from '../domain/imageDb';
import { isRemoteImage } from '../domain/imageStorage';
import { Image as ImageIcon } from 'lucide-react';

export default function ProductImage({ imageId, alt, size = 40, style = {} }) {
  const [src, setSrc] = useState(null);
  
  useEffect(() => {
    let isMounted = true;
    if (imageId) {
      if (imageId.startsWith('data:image/') || isRemoteImage(imageId)) {
        if (isMounted) setSrc(imageId);
      } else {
        getImage(imageId).then(dataUrl => {
          if (isMounted && dataUrl) setSrc(dataUrl);
        }).catch(err => console.error("Lỗi tải hình:", err));
      }
    }
    return () => { isMounted = false; };
  }, [imageId]);

  if (!imageId || !src) {
    return (
      <div style={{
        width: size, 
        height: size, 
        backgroundColor: 'var(--color-bg-hover)', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        borderRadius: 'var(--radius-sm)',
        color: 'var(--color-text-muted)',
        ...style
      }}>
        <ImageIcon size={size * 0.5} />
      </div>
    );
  }

  return (
    <img 
      src={src} 
      alt={alt} 
      style={{
        width: size,
        height: size,
        objectFit: 'cover',
        borderRadius: 'var(--radius-sm)',
        border: '1px solid var(--color-border)',
        ...style
      }} 
    />
  );
}
