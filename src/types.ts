export type Datum = {
  date: string;
  category_scores: {
    history: number;
    geography: number;
    science: number;
    sport: number;
    music: number;
    art: number;
    guest: number;
    current_affairs: number;
    general_knowledge: number;
    film: number;
  };

  double_up_category: Category;
  round_placement: number[];
};

export type Data = Datum[];

export type Category =
  | "history"
  | "geography"
  | "science"
  | "sport"
  | "music"
  | "art"
  | "guest"
  | "current_affairs"
  | "general_knowledge"
  | "film";

export const labels: Category[] = [
  "history",
  "geography",
  "science",
  "sport",
  "music",
  "art",
  "guest",
  "current_affairs",
  "general_knowledge",
  "film",
];
