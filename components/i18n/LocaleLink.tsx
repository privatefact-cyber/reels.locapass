"use client";

import NextLink from "next/link";
import { forwardRef, type ComponentProps } from "react";
import { useLocalize } from "@/components/i18n/LocaleProvider";

/**
 * next/link の代わりに使うリンク。サイト内リンクに今の言語の接頭辞(/en /zh /ar)を付ける
 * (日本語・外部URL・管理画面等の対象外パスはそのまま。lib/i18n/localePath.ts の localizeHref)。
 * 公開ページでは `import Link from "@/components/i18n/LocaleLink"` で next/link と置き換えて使う。
 */
const LocaleLink = forwardRef<HTMLAnchorElement, ComponentProps<typeof NextLink>>(function LocaleLink({ href, ...rest }, ref) {
  const localize = useLocalize();
  const localized =
    typeof href === "string"
      ? localize(href)
      : href.pathname
        ? { ...href, pathname: localize(href.pathname) }
        : href;
  return <NextLink ref={ref} href={localized} {...rest} />;
});

export default LocaleLink;
