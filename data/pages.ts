export interface Page {
  id: string;
  title: string;
  slug: string;
  content: string;
  status: 'publish' | 'draft' | 'pending';
  author: string;
  date: string;
}

export const samplePages: Page[] = [
  {
    id: "1",
    title: "Home",
    slug: "home",
    content: "Welcome to LCP Auto Cars. We provide premium car tuning and parts.",
    status: "publish",
    author: "admin",
    date: "2024-01-15T08:00:00Z"
  },
  {
    id: "2",
    title: "About Us",
    slug: "about-us",
    content: "Our team has over 10 years of experience in high-performance automotive tuning.",
    status: "publish",
    author: "admin",
    date: "2024-01-20T11:30:00Z"
  },
  {
    id: "3",
    title: "Contact",
    slug: "contact",
    content: "Get in touch with us for your next project.",
    status: "publish",
    author: "admin",
    date: "2024-02-05T15:45:00Z"
  },
  {
    id: "4",
    title: "Privacy Policy",
    slug: "privacy-policy",
    content: "We take your privacy seriously. Here is how we handle your data.",
    status: "draft",
    author: "admin",
    date: "2024-02-28T10:00:00Z"
  }
];
