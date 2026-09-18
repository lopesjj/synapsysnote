import type { CSSProperties } from "react";

export type CoverCategory = "images" | "gradients" | "patterns";

export type CoverImageTheme = "nature" | "architecture" | "art" | "editorial";

export type CoverPreset = {
  id: string;
  label: string;
  category?: CoverCategory;
  theme?: CoverImageTheme;
  imageUrl?: string;
  thumbnailUrl?: string;
  className?: string;
  style?: CSSProperties;
};

const IMAGE_PRESETS: CoverPreset[] = [
  {
    id: "cover:img:dolomites",
    label: "Dolomitas",
    category: "images",
    theme: "nature",
    imageUrl: "https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=1600&q=80",
    thumbnailUrl: "https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=360&q=75",
    style: {
      backgroundImage: "url('https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=1600&q=80')",
      backgroundSize: "cover",
      backgroundPosition: "center",
      backgroundColor: "#0f172a",
    },
  },
  {
    id: "cover:img:mist-forest",
    label: "Floresta Nebulosa",
    category: "images",
    theme: "nature",
    imageUrl: "https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=1600&q=80",
    thumbnailUrl: "https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=360&q=75",
    style: {
      backgroundImage: "url('https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=1600&q=80')",
      backgroundSize: "cover",
      backgroundPosition: "center",
      backgroundColor: "#064e3b",
    },
  },
  {
    id: "cover:img:mountain-stars",
    label: "Céu Estrelado",
    category: "images",
    theme: "nature",
    imageUrl: "https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=1600&q=80",
    thumbnailUrl: "https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=360&q=75",
    style: {
      backgroundImage: "url('https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=1600&q=80')",
      backgroundSize: "cover",
      backgroundPosition: "center",
      backgroundColor: "#020617",
    },
  },
  {
    id: "cover:img:lake-reflection",
    label: "Lago Sereno",
    category: "images",
    theme: "nature",
    imageUrl: "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?auto=format&fit=crop&w=1600&q=80",
    thumbnailUrl: "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?auto=format&fit=crop&w=360&q=75",
    style: {
      backgroundImage: "url('https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?auto=format&fit=crop&w=1600&q=80')",
      backgroundSize: "cover",
      backgroundPosition: "center",
      backgroundColor: "#0c4a6e",
    },
  },
  {
    id: "cover:img:desert-dunes",
    label: "Dunas Douradas",
    category: "images",
    theme: "nature",
    imageUrl: "https://images.unsplash.com/photo-1509316975850-ff9c5deb0cd9?auto=format&fit=crop&w=1600&q=80",
    thumbnailUrl: "https://images.unsplash.com/photo-1509316975850-ff9c5deb0cd9?auto=format&fit=crop&w=360&q=75",
    style: {
      backgroundImage: "url('https://images.unsplash.com/photo-1509316975850-ff9c5deb0cd9?auto=format&fit=crop&w=1600&q=80')",
      backgroundSize: "cover",
      backgroundPosition: "center",
      backgroundColor: "#78350f",
    },
  },
  {
    id: "cover:img:nordic-aurora",
    label: "Aurora Boreal",
    category: "images",
    theme: "nature",
    imageUrl: "https://images.unsplash.com/photo-1531366936337-7c912a4589a7?auto=format&fit=crop&w=1600&q=80",
    thumbnailUrl: "https://images.unsplash.com/photo-1531366936337-7c912a4589a7?auto=format&fit=crop&w=360&q=75",
    style: {
      backgroundImage: "url('https://images.unsplash.com/photo-1531366936337-7c912a4589a7?auto=format&fit=crop&w=1600&q=80')",
      backgroundSize: "cover",
      backgroundPosition: "center",
      backgroundColor: "#022c22",
    },
  },
  {
    id: "cover:img:coast-sunset",
    label: "Pôr do Sol Costeiro",
    category: "images",
    theme: "nature",
    imageUrl: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1600&q=80",
    thumbnailUrl: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=360&q=75",
    style: {
      backgroundImage: "url('https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1600&q=80')",
      backgroundSize: "cover",
      backgroundPosition: "center",
      backgroundColor: "#0c4a6e",
    },
  },
  {
    id: "cover:img:fuji-twilight",
    label: "Monte Fuji",
    category: "images",
    theme: "nature",
    imageUrl: "https://images.unsplash.com/photo-1490806843957-31f4c9a91c65?auto=format&fit=crop&w=1600&q=80",
    thumbnailUrl: "https://images.unsplash.com/photo-1490806843957-31f4c9a91c65?auto=format&fit=crop&w=360&q=75",
    style: {
      backgroundImage: "url('https://images.unsplash.com/photo-1490806843957-31f4c9a91c65?auto=format&fit=crop&w=1600&q=80')",
      backgroundSize: "cover",
      backgroundPosition: "center",
      backgroundColor: "#1e1b4b",
    },
  },
  {
    id: "cover:img:swiss-alps",
    label: "Alpes Majestosos",
    category: "images",
    theme: "nature",
    imageUrl: "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1600&q=80",
    thumbnailUrl: "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=360&q=75",
    style: {
      backgroundImage: "url('https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1600&q=80')",
      backgroundSize: "cover",
      backgroundPosition: "center",
      backgroundColor: "#0f172a",
    },
  },
  {
    id: "cover:img:calm-ocean",
    label: "Oceano Profundo",
    category: "images",
    theme: "nature",
    imageUrl: "https://images.unsplash.com/photo-1505118380757-91f5f5632de0?auto=format&fit=crop&w=1600&q=80",
    thumbnailUrl: "https://images.unsplash.com/photo-1505118380757-91f5f5632de0?auto=format&fit=crop&w=360&q=75",
    style: {
      backgroundImage: "url('https://images.unsplash.com/photo-1505118380757-91f5f5632de0?auto=format&fit=crop&w=1600&q=80')",
      backgroundSize: "cover",
      backgroundPosition: "center",
      backgroundColor: "#0369a1",
    },
  },
  {
    id: "cover:img:autumn-forest",
    label: "Bosque Dourado",
    category: "images",
    theme: "nature",
    imageUrl: "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=1600&q=80",
    thumbnailUrl: "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=360&q=75",
    style: {
      backgroundImage: "url('https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=1600&q=80')",
      backgroundSize: "cover",
      backgroundPosition: "center",
      backgroundColor: "#78350f",
    },
  },
  {
    id: "cover:img:canyon",
    label: "Grand Canyon",
    category: "images",
    theme: "nature",
    imageUrl: "https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?auto=format&fit=crop&w=1600&q=80",
    thumbnailUrl: "https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?auto=format&fit=crop&w=360&q=75",
    style: {
      backgroundImage: "url('https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?auto=format&fit=crop&w=1600&q=80')",
      backgroundSize: "cover",
      backgroundPosition: "center",
      backgroundColor: "#831843",
    },
  },
  {
    id: "cover:img:minimal-arch",
    label: "Minimalismo Branco",
    category: "images",
    theme: "architecture",
    imageUrl: "https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=1600&q=80",
    thumbnailUrl: "https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=360&q=75",
    style: {
      backgroundImage: "url('https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=1600&q=80')",
      backgroundSize: "cover",
      backgroundPosition: "center",
      backgroundColor: "#f8fafc",
    },
  },
  {
    id: "cover:img:spiral-stair",
    label: "Espiral Arquitetônica",
    category: "images",
    theme: "architecture",
    imageUrl: "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=1600&q=80",
    thumbnailUrl: "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=360&q=75",
    style: {
      backgroundImage: "url('https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=1600&q=80')",
      backgroundSize: "cover",
      backgroundPosition: "center",
      backgroundColor: "#0f172a",
    },
  },
  {
    id: "cover:img:concrete-light",
    label: "Luz & Concreto",
    category: "images",
    theme: "architecture",
    imageUrl: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1600&q=80",
    thumbnailUrl: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=360&q=75",
    style: {
      backgroundImage: "url('https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1600&q=80')",
      backgroundSize: "cover",
      backgroundPosition: "center",
      backgroundColor: "#18181b",
    },
  },
  {
    id: "cover:img:warm-interior",
    label: "Espaço Escandinavo",
    category: "images",
    theme: "architecture",
    imageUrl: "https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?auto=format&fit=crop&w=1600&q=80",
    thumbnailUrl: "https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?auto=format&fit=crop&w=360&q=75",
    style: {
      backgroundImage: "url('https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?auto=format&fit=crop&w=1600&q=80')",
      backgroundSize: "cover",
      backgroundPosition: "center",
      backgroundColor: "#292524",
    },
  },
  {
    id: "cover:img:modern-facade",
    label: "Linhas Modernistas",
    category: "images",
    theme: "architecture",
    imageUrl: "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=1600&q=80",
    thumbnailUrl: "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=360&q=75",
    style: {
      backgroundImage: "url('https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=1600&q=80')",
      backgroundSize: "cover",
      backgroundPosition: "center",
      backgroundColor: "#1f2937",
    },
  },
  {
    id: "cover:img:minimal-stairs",
    label: "Perspectiva Urbana",
    category: "images",
    theme: "architecture",
    imageUrl: "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=1600&q=80",
    thumbnailUrl: "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=360&q=75",
    style: {
      backgroundImage: "url('https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=1600&q=80')",
      backgroundSize: "cover",
      backgroundPosition: "center",
      backgroundColor: "#0f172a",
    },
  },
  {
    id: "cover:img:gold-fluid",
    label: "Fluido Dourado",
    category: "images",
    theme: "art",
    imageUrl: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=1600&q=80",
    thumbnailUrl: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=360&q=75",
    style: {
      backgroundImage: "url('https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=1600&q=80')",
      backgroundSize: "cover",
      backgroundPosition: "center",
      backgroundColor: "#1c1917",
    },
  },
  {
    id: "cover:img:dark-silk",
    label: "Seda Escura",
    category: "images",
    theme: "art",
    imageUrl: "https://images.unsplash.com/photo-1579546929518-9e396f3cc809?auto=format&fit=crop&w=1600&q=80",
    thumbnailUrl: "https://images.unsplash.com/photo-1579546929518-9e396f3cc809?auto=format&fit=crop&w=360&q=75",
    style: {
      backgroundImage: "url('https://images.unsplash.com/photo-1579546929518-9e396f3cc809?auto=format&fit=crop&w=1600&q=80')",
      backgroundSize: "cover",
      backgroundPosition: "center",
      backgroundColor: "#18181b",
    },
  },
  {
    id: "cover:img:abstract-waves",
    label: "Aquarela Orgânica",
    category: "images",
    theme: "art",
    imageUrl: "https://images.unsplash.com/photo-1541701494587-cb58502866ab?auto=format&fit=crop&w=1600&q=80",
    thumbnailUrl: "https://images.unsplash.com/photo-1541701494587-cb58502866ab?auto=format&fit=crop&w=360&q=75",
    style: {
      backgroundImage: "url('https://images.unsplash.com/photo-1541701494587-cb58502866ab?auto=format&fit=crop&w=1600&q=80')",
      backgroundSize: "cover",
      backgroundPosition: "center",
      backgroundColor: "#312e81",
    },
  },
  {
    id: "cover:img:deep-space",
    label: "Cosmos Profundo",
    category: "images",
    theme: "art",
    imageUrl: "https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=1600&q=80",
    thumbnailUrl: "https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=360&q=75",
    style: {
      backgroundImage: "url('https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=1600&q=80')",
      backgroundSize: "cover",
      backgroundPosition: "center",
      backgroundColor: "#020617",
    },
  },
  {
    id: "cover:img:glass-prism",
    label: "Prisma de Luz",
    category: "images",
    theme: "art",
    imageUrl: "https://images.unsplash.com/photo-1550684848-fac1c5b4e853?auto=format&fit=crop&w=1600&q=80",
    thumbnailUrl: "https://images.unsplash.com/photo-1550684848-fac1c5b4e853?auto=format&fit=crop&w=360&q=75",
    style: {
      backgroundImage: "url('https://images.unsplash.com/photo-1550684848-fac1c5b4e853?auto=format&fit=crop&w=1600&q=80')",
      backgroundSize: "cover",
      backgroundPosition: "center",
      backgroundColor: "#09090b",
    },
  },
  {
    id: "cover:img:art-acrylic",
    label: "Pintura Contemporânea",
    category: "images",
    theme: "art",
    imageUrl: "https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?auto=format&fit=crop&w=1600&q=80",
    thumbnailUrl: "https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?auto=format&fit=crop&w=360&q=75",
    style: {
      backgroundImage: "url('https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?auto=format&fit=crop&w=1600&q=80')",
      backgroundSize: "cover",
      backgroundPosition: "center",
      backgroundColor: "#4c0519",
    },
  },
  {
    id: "cover:img:library",
    label: "Biblioteca Nobre",
    category: "images",
    theme: "editorial",
    imageUrl: "https://images.unsplash.com/photo-1524995997946-a1c2e315a42f?auto=format&fit=crop&w=1600&q=80",
    thumbnailUrl: "https://images.unsplash.com/photo-1524995997946-a1c2e315a42f?auto=format&fit=crop&w=360&q=75",
    style: {
      backgroundImage: "url('https://images.unsplash.com/photo-1524995997946-a1c2e315a42f?auto=format&fit=crop&w=1600&q=80')",
      backgroundSize: "cover",
      backgroundPosition: "center",
      backgroundColor: "#1c1917",
    },
  },
  {
    id: "cover:img:library-vintage",
    label: "Acervo Histórico",
    category: "images",
    theme: "editorial",
    imageUrl: "https://images.unsplash.com/photo-1481627834876-b7833e8f5570?auto=format&fit=crop&w=1600&q=80",
    thumbnailUrl: "https://images.unsplash.com/photo-1481627834876-b7833e8f5570?auto=format&fit=crop&w=360&q=75",
    style: {
      backgroundImage: "url('https://images.unsplash.com/photo-1481627834876-b7833e8f5570?auto=format&fit=crop&w=1600&q=80')",
      backgroundSize: "cover",
      backgroundPosition: "center",
      backgroundColor: "#27272a",
    },
  },
  {
    id: "cover:img:botanical-dark",
    label: "Botânica Noturna",
    category: "images",
    theme: "editorial",
    imageUrl: "https://images.unsplash.com/photo-1518531933037-91b2f5f229cc?auto=format&fit=crop&w=1600&q=80",
    thumbnailUrl: "https://images.unsplash.com/photo-1518531933037-91b2f5f229cc?auto=format&fit=crop&w=360&q=75",
    style: {
      backgroundImage: "url('https://images.unsplash.com/photo-1518531933037-91b2f5f229cc?auto=format&fit=crop&w=1600&q=80')",
      backgroundSize: "cover",
      backgroundPosition: "center",
      backgroundColor: "#052e16",
    },
  },
  {
    id: "cover:img:cherry-blossom",
    label: "Cerejeira em Flor",
    category: "images",
    theme: "editorial",
    imageUrl: "https://images.unsplash.com/photo-1522383225653-ed111181a951?auto=format&fit=crop&w=1600&q=80",
    thumbnailUrl: "https://images.unsplash.com/photo-1522383225653-ed111181a951?auto=format&fit=crop&w=360&q=75",
    style: {
      backgroundImage: "url('https://images.unsplash.com/photo-1522383225653-ed111181a951?auto=format&fit=crop&w=1600&q=80')",
      backgroundSize: "cover",
      backgroundPosition: "center",
      backgroundColor: "#831843",
    },
  },
  {
    id: "cover:img:monstera-shadow",
    label: "Sombra Tropical",
    category: "images",
    theme: "editorial",
    imageUrl: "https://images.unsplash.com/photo-1509198397868-475647b2a1e5?auto=format&fit=crop&w=1600&q=80",
    thumbnailUrl: "https://images.unsplash.com/photo-1509198397868-475647b2a1e5?auto=format&fit=crop&w=360&q=75",
    style: {
      backgroundImage: "url('https://images.unsplash.com/photo-1509198397868-475647b2a1e5?auto=format&fit=crop&w=1600&q=80')",
      backgroundSize: "cover",
      backgroundPosition: "center",
      backgroundColor: "#1c1917",
    },
  },
  {
    id: "cover:img:coffee-desk",
    label: "Mesa de Criação",
    category: "images",
    theme: "editorial",
    imageUrl: "https://images.unsplash.com/photo-1499750310107-5fef28a66643?auto=format&fit=crop&w=1600&q=80",
    thumbnailUrl: "https://images.unsplash.com/photo-1499750310107-5fef28a66643?auto=format&fit=crop&w=360&q=75",
    style: {
      backgroundImage: "url('https://images.unsplash.com/photo-1499750310107-5fef28a66643?auto=format&fit=crop&w=1600&q=80')",
      backgroundSize: "cover",
      backgroundPosition: "center",
      backgroundColor: "#27272a",
    },
  },
  {
    id: "cover:img:tokyo-rain",
    label: "Noite Urbana",
    category: "images",
    theme: "editorial",
    imageUrl: "https://images.unsplash.com/photo-1503899036084-c55cdd92da26?auto=format&fit=crop&w=1600&q=80",
    thumbnailUrl: "https://images.unsplash.com/photo-1503899036084-c55cdd92da26?auto=format&fit=crop&w=360&q=75",
    style: {
      backgroundImage: "url('https://images.unsplash.com/photo-1503899036084-c55cdd92da26?auto=format&fit=crop&w=1600&q=80')",
      backgroundSize: "cover",
      backgroundPosition: "center",
      backgroundColor: "#09090b",
    },
  },
  {
    id: "cover:img:minimal-zen",
    label: "Jardim Zen",
    category: "images",
    theme: "editorial",
    imageUrl: "https://images.unsplash.com/photo-1518241353330-0f7941c2d9b5?auto=format&fit=crop&w=1600&q=80",
    thumbnailUrl: "https://images.unsplash.com/photo-1518241353330-0f7941c2d9b5?auto=format&fit=crop&w=360&q=75",
    style: {
      backgroundImage: "url('https://images.unsplash.com/photo-1518241353330-0f7941c2d9b5?auto=format&fit=crop&w=1600&q=80')",
      backgroundSize: "cover",
      backgroundPosition: "center",
      backgroundColor: "#292524",
    },
  },
];

const GRADIENT_PRESETS: CoverPreset[] = [
  {
    id: "cover:teal",
    label: "Atlântico",
    category: "gradients",
    className: "bg-gradient-to-r from-[#0F2C4C] via-[#0E7490] to-[#67E8F9]",
  },
  {
    id: "cover:dusk",
    label: "Entardecer",
    category: "gradients",
    className: "bg-gradient-to-r from-[#1E1B4B] via-[#6D28D9] to-[#FB7185]",
  },
  {
    id: "cover:forest",
    label: "Floresta",
    category: "gradients",
    className: "bg-gradient-to-r from-[#064E3B] via-[#059669] to-[#BEF264]",
  },
  {
    id: "cover:sand",
    label: "Areia",
    category: "gradients",
    className: "bg-gradient-to-r from-[#FDE68A] via-[#FDBA74] to-[#FB7185]",
  },
  {
    id: "cover:ink",
    label: "Noite",
    category: "gradients",
    className: "bg-gradient-to-r from-[#07111C] via-[#155E75] to-[#22D3EE]",
  },
  {
    id: "cover:aurora",
    label: "Aurora",
    category: "gradients",
    className: "bg-gradient-to-br from-[#022c22] via-[#0f766e] to-[#a7f3d0]",
  },
  {
    id: "cover:nebula",
    label: "Nébula",
    category: "gradients",
    className: "bg-gradient-to-tr from-[#1e1b4b] via-[#7c3aed] to-[#fb7185]",
  },
  {
    id: "cover:glacier",
    label: "Geleira",
    category: "gradients",
    className: "bg-gradient-to-r from-[#0c4a6e] via-[#38bdf8] to-[#e0f2fe]",
  },
  {
    id: "cover:ember",
    label: "Brasa",
    category: "gradients",
    className: "bg-gradient-to-r from-[#431407] via-[#ea580c] to-[#fde68a]",
  },
  {
    id: "cover:matcha",
    label: "Matchá",
    category: "gradients",
    className: "bg-gradient-to-bl from-[#14532d] via-[#65a30d] to-[#fef9c3]",
  },
  {
    id: "cover:terracotta",
    label: "Terracota",
    category: "gradients",
    className: "bg-gradient-to-r from-[#7c2d12] via-[#c2410c] to-[#fdba74]",
  },
  {
    id: "cover:rose",
    label: "Quartzo",
    category: "gradients",
    className: "bg-gradient-to-r from-[#831843] via-[#fb7185] to-[#ffe4e6]",
  },
  {
    id: "cover:cobalt",
    label: "Cobalto",
    category: "gradients",
    className: "bg-gradient-to-br from-[#172554] via-[#2563eb] to-[#67e8f9]",
  },
  {
    id: "cover:vineyard",
    label: "Vinhedo",
    category: "gradients",
    className: "bg-gradient-to-r from-[#3b0764] via-[#7e22ce] to-[#f5d0fe]",
  },
  {
    id: "cover:cerrado",
    label: "Cerrado",
    category: "gradients",
    className: "bg-gradient-to-r from-[#365314] via-[#ca8a04] to-[#fef08a]",
  },
  {
    id: "cover:ipe",
    label: "Ipê",
    category: "gradients",
    className: "bg-gradient-to-br from-[#422006] via-[#f59e0b] to-[#fef9c3]",
  },
  {
    id: "cover:bandeira",
    label: "Verde e ouro",
    category: "gradients",
    className: "bg-gradient-to-r from-[#14532d] via-[#15803d] to-[#facc15]",
  },
  {
    id: "cover:parchment",
    label: "Pergaminho",
    category: "gradients",
    className: "bg-gradient-to-b from-[#fff7ed] via-[#fed7aa] to-[#d6d3d1]",
  },
  {
    id: "cover:library",
    label: "Biblioteca",
    category: "gradients",
    className: "bg-gradient-to-r from-[#1c1917] via-[#7c2d12] to-[#d6d3d1]",
  },
];

const PATTERN_PRESETS: CoverPreset[] = [
  {
    id: "cover:paper",
    label: "Listra suave",
    category: "patterns",
    className: "bg-[#eef2ff]",
    style: {
      backgroundImage:
        "repeating-linear-gradient(135deg, rgba(79,70,229,0.16) 0 14px, transparent 14px 28px)",
    },
  },
  {
    id: "cover:grid",
    label: "Caderno",
    category: "patterns",
    className: "bg-[#0f172a]",
    style: {
      backgroundImage:
        "linear-gradient(rgba(148,163,184,0.22) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.22) 1px, transparent 1px)",
      backgroundSize: "28px 28px",
    },
  },
  {
    id: "cover:dots",
    label: "Pontos",
    category: "patterns",
    className: "bg-[#0b1220]",
    style: {
      backgroundImage: "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.28) 1px, transparent 0)",
      backgroundSize: "18px 18px",
    },
  },
  {
    id: "cover:waves",
    label: "Ondas",
    category: "patterns",
    className: "bg-[#082f49]",
    style: {
      backgroundImage:
        "radial-gradient(120% 80% at 0% 100%, rgba(56,189,248,0.55), transparent), radial-gradient(90% 70% at 100% 0%, rgba(45,212,191,0.45), transparent)",
    },
  },
  {
    id: "cover:constellation",
    label: "Constelação",
    category: "patterns",
    className: "bg-[#020617]",
    style: {
      backgroundImage:
        "radial-gradient(1.5px 1.5px at 12% 28%, #fff 50%, transparent), radial-gradient(1.5px 1.5px at 38% 62%, #e0f2fe 50%, transparent), radial-gradient(1.2px 1.2px at 72% 18%, #fff 50%, transparent), radial-gradient(1.8px 1.8px at 86% 74%, #a5b4fc 50%, transparent), radial-gradient(80% 60% at 50% 120%, rgba(79,70,229,0.45), transparent)",
    },
  },
  {
    id: "cover:mosaic",
    label: "Mosaico",
    category: "patterns",
    className: "bg-[#111827]",
    style: {
      backgroundImage:
        "linear-gradient(60deg, #0ea5e9 25%, transparent 25%), linear-gradient(120deg, #8b5cf6 25%, transparent 25%), linear-gradient(180deg, #f43f5e 12%, transparent 12%)",
      backgroundSize: "48px 48px",
      backgroundBlendMode: "screen",
    },
  },
];

export const COVER_PRESETS: CoverPreset[] = [
  ...IMAGE_PRESETS,
  ...GRADIENT_PRESETS,
  ...PATTERN_PRESETS,
];

export function coverPresetById(id: string | null | undefined) {
  if (!id) return undefined;
  return COVER_PRESETS.find((item) => item.id === id);
}
