"use client";

import { useEffect, useState } from "react";
import { Calendar, Users, Star, MapPin, Phone } from "lucide-react";
import { ShopContactModal } from "@/components/ShopContactModal";
import { useLocale } from "@/components/i18n/LocaleProvider";
import type { Dictionary } from "@/lib/i18n/dictionaries";

function getScrollItems(t: Dictionary) {
  return [
    { id: "today", label: t.shop.navSchedule, icon: Calendar },
    { id: "cast", label: t.shop.navCast, icon: Users },
    { id: "price", label: t.shop.navPrice, icon: Star },
    { id: "access", label: t.shop.navAccess, icon: MapPin },
  ];
}

export function ShopSectionNav({
  shopId,
  phone,
  lineContactUrl,
  lineQrImageUrl,
  sections,
}: {
  shopId: string;
  phone: string | null;
  lineContactUrl: string | null;
  lineQrImageUrl: string | null;
  /** 店舗ページに実際に表示されているセクションのid。未入力で非表示のセクションはナビにも出さない。 */
  sections: string[];
}) {
  const { t } = useLocale();
  const SCROLL_ITEMS = getScrollItems(t).filter((item) => sections.includes(item.id));
  const [activeId, setActiveId] = useState(SCROLL_ITEMS[0]?.id ?? "");
  const [contactOpen, setContactOpen] = useState(false);
  const showContact = Boolean(phone || lineContactUrl);

  useEffect(() => {
    const sections = SCROLL_ITEMS.map((item) => document.getElementById(item.id)).filter(
      (el): el is HTMLElement => el !== null,
    );

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]) {
          setActiveId(visible[0].target.id);
        }
      },
      { rootMargin: "-45% 0px -45% 0px", threshold: [0, 0.25, 0.5, 0.75, 1] },
    );

    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    e.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <>
      <nav className="fixed inset-x-0 bottom-24 z-50 mx-auto w-fit max-w-[92%] md:bottom-6">
        <ul className="flex items-center gap-4 rounded-full border border-amber-500/30 bg-zinc-950/70 px-5 py-2.5 shadow-[0_10px_30px_rgba(0,0,0,0.8),0_0_20px_rgba(245,158,11,0.15)] backdrop-blur-2xl sm:gap-6">
          {SCROLL_ITEMS.map(({ id, label, icon: Icon }) => {
            const isActive = activeId === id;
            return (
              <li key={id}>
                <a
                  href={`#${id}`}
                  onClick={(e) => handleClick(e, id)}
                  className={
                    isActive
                      ? "flex flex-col items-center gap-1 rounded-full bg-gradient-to-r from-amber-400 to-amber-500 px-3 py-1 text-[10px] font-bold text-zinc-950 shadow-[0_0_12px_rgba(245,158,11,0.4)]"
                      : "flex flex-col items-center gap-1 text-[10px] text-zinc-400 transition hover:text-amber-300"
                  }
                >
                  <Icon size={16} />
                  {label}
                </a>
              </li>
            );
          })}
          {showContact && (
            <li>
              <button
                type="button"
                onClick={() => setContactOpen(true)}
                className="flex flex-col items-center gap-1 text-[10px] text-zinc-400 transition hover:text-amber-300"
              >
                <Phone size={16} />
                {t.shop.navContact}
              </button>
            </li>
          )}
        </ul>
      </nav>

      <ShopContactModal
        shopId={shopId}
        open={contactOpen}
        onClose={() => setContactOpen(false)}
        phone={phone}
        lineContactUrl={lineContactUrl}
        lineQrImageUrl={lineQrImageUrl}
      />
    </>
  );
}
