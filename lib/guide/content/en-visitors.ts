import type { GuideText } from "../i18n";

/** 英語版(訪日客向け)。構造(段落・項目の数)は日本語版(visitors.ts)と同じ。 */
export const EN_VISITORS: Record<string, GuideText> = {
  "japan-eating-out-tips-for-visitors": {
    title: "Eating Out in Japan for Visitors: Payment, Tipping, Reservations and Dietary Needs",
    description:
      "A first-timer's guide to Japanese cafés and restaurants: entering and ordering, tipping, otoshi and payment, reservations, and how to explain what you cannot eat.",
    lead: "Every Japanese restaurant has its own way of seating and paying. Here are the basics to help first-time visitors enjoy eating out without confusion.",
    sections: [
      {
        heading: "Before you eat out in Japan",
        paragraphs: [
          "Japan has countless small places: ramen shops, casual diners, izakaya and cafés. Entry and ordering differ from place to place, so look at the signs at the entrance and inside, and follow them.",
        ],
      },
      {
        heading: "Entering and ordering",
        list: [
          "Some places ask you to wait until staff show you to a seat; others let you choose your own",
          "Some places have a ticket machine at the entrance where you buy a meal ticket first",
          "Water and a wet towel are often served free of charge",
          "Follow the guidance of staff and the signs for each place's rules",
        ],
      },
      {
        heading: "Money and payment",
        paragraphs: [
          "Tipping is not customary in Japan. At many places you pay at the register by the exit, not at the table.",
        ],
        list: [
          "Whether credit cards are accepted depends on the place. Some are cash only",
          "At an izakaya, a small dish called otoshi may be served and charged for",
          "If a charge is unclear, you are welcome to ask when you pay",
        ],
      },
      {
        heading: "Reservations and crowds",
        paragraphs: [
          "Popular places may require a reservation or have a line. Opening hours and closing days differ by place, and some close between lunch and dinner. Check the place's page before you go.",
        ],
      },
      {
        heading: "If there is something you cannot eat",
        paragraphs: [
          "If you have allergies or follow a vegetarian diet, say so before you order. What a place can accommodate differs from place to place.",
        ],
        list: [
          "Tell the staff what you cannot eat before you enter or before you order",
          "Ask the staff to confirm the ingredients (a translation app makes this easier)",
        ],
      },
      {
        heading: "Finding places on LOCAPASS",
        paragraphs: [
          "On LOCAPASS you can see each place's atmosphere in short videos (reels) and search by area and genre. You can switch the screen to English. Some information registered by the shops may remain in Japanese.",
        ],
      },
    ],
    faq: [
      { q: "Do I need to tip?", a: "No. Tipping is not customary in Japan." },
      { q: "Is a reservation required?", a: "It depends on the place. Popular places may require one." },
    ],
  },
  "japan-local-cafes-guide": {
    title: "Enjoying Cafés in Japan: Kissaten, Coffee Shops, Sweets and Shaved Ice",
    description:
      "The main kinds of Japanese cafés (kissaten, coffee shops and sweets cafés) for visitors, plus morning sets, how to use your seat, payment and how to find them.",
    lead: "Japanese cafés range from old-fashioned kissaten to roast-in-house coffee shops and seasonal sweets. Here is how to enjoy them.",
    sections: [
      {
        heading: "Kinds of cafés in Japan",
        list: [
          "Kissaten: a traditional, calm café. Some serve morning sets and light meals",
          "Coffee shop: a place that cares about beans, often roasting in-house. Some serve specialty coffee",
          "Sweets café: a place to enjoy cakes, parfaits and baked sweets",
          "Shaved ice and Japanese sweets: places serving seasonal shaved ice and wagashi. Shaved ice is popular in summer",
        ],
      },
      {
        heading: "Morning sets and lunch",
        paragraphs: [
          "Some kissaten offer a \"morning set\" in the early hours, where a drink comes with toast or similar. Contents and hours differ from place to place.",
        ],
      },
      {
        heading: "Using your seat",
        list: [
          "When it is busy, avoid staying too long so you do not trouble other guests",
          "Do not leave your belongings on a seat when you walk away",
          "Whether a seat is non-smoking or smoking differs by place. Please check before you enter",
        ],
      },
      {
        heading: "Payment",
        paragraphs: [
          "Tipping is not customary. Some cafés ask you to pay when you order, others when you leave. Please check whether cards are accepted at each place.",
        ],
      },
      {
        heading: "Finding cafés on LOCAPASS",
        paragraphs: [
          "On LOCAPASS you can search for cafés by area and genre. Watch the short videos (reels) to see each place's atmosphere before you decide where to go.",
        ],
      },
    ],
    faq: [
      { q: "Is it easy to go alone?", a: "Many cafés welcome solo visitors. When it is busy, you may be asked to share a table." },
    ],
  },
  "dog-friendly-cafes-japan": {
    title: "How to Find Dog-Friendly Cafés in Japan, and Etiquette to Know",
    description:
      "For visitors looking for pet-friendly cafés and restaurants in Japan: what to check before you go in, etiquette, and how to search on LOCAPASS.",
    lead: "Some cafés and restaurants in Japan welcome pets, but the conditions differ by place. Here are the key points on checking ahead and etiquette.",
    sections: [
      {
        heading: "What \"pet-friendly\" means",
        paragraphs: [
          "Even if a place allows pets, the conditions differ. Some allow them only on the terrace, some inside too, and some only small dogs.",
        ],
      },
      {
        heading: "What to check before you go in",
        list: [
          "Where pets are allowed (terrace only, or inside as well)",
          "Any limits on the dog's size or the number of dogs",
          "Rules about leashes and carriers (cages)",
          "Whether a reservation is needed",
        ],
      },
      {
        heading: "Etiquette",
        list: [
          "Keep the leash short or keep the dog in a carrier, near your seat",
          "Keep the dog away from other guests and from food",
          "Clean up after your dog, and bring supplies for it",
          "If your dog keeps barking, step outside for a while",
        ],
      },
      {
        heading: "Searching on LOCAPASS",
        paragraphs: [
          "On LOCAPASS you can search for places with a \"pet-friendly\" tag. Check each place's page for the conditions it registered, such as terrace-only.",
        ],
      },
    ],
    faq: [
      { q: "How can I tell whether a place allows pets?", a: "Check the information on the place's page, and if it is unclear, ask in advance, for example by phone." },
    ],
  },
};
