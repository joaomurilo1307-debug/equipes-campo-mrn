// Facetas de origami (referência ao pássaro do logotipo): usadas só como textura de fundo.
export default function Facetas({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 400 400" className={className} aria-hidden="true" preserveAspectRatio="xMidYMid slice">
      <polygon points="0,0 220,0 0,260" fill="#E63329" opacity="0.92" />
      <polygon points="220,0 400,0 400,150 0,260" fill="#C22921" opacity="0.55" />
      <polygon points="0,260 400,150 400,400 140,400" fill="#0A9E7F" opacity="0.4" />
      <polygon points="0,260 140,400 0,400" fill="#077A62" opacity="0.7" />
      <polygon points="140,400 400,400 400,300" fill="#0A3D32" opacity="0.65" />
    </svg>
  );
}
