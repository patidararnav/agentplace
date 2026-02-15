import { cn } from '@/lib/utils';

type BrandLogoProps = {
  className?: string;
  alt?: string;
};

export function BrandLogo({ className, alt = 'AgentPlace' }: BrandLogoProps) {
  return (
    <img
      src="/agentplacelogonew.png"
      alt={alt}
      className={cn('rounded-md object-contain', className)}
    />
  );
}
