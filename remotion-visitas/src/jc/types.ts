export type JCWord = {
  t: string;
  start: number;
  end: number;
  hl?: boolean;
};

export type JCLine = {
  show: number;
  hide: number;
  words: JCWord[];
  accent?: boolean;
};

export type JCMoment = {
  from: number;
  to: number;
  lines: JCLine[];
};

export type JCData = {
  introLines: JCLine[];
  moments: JCMoment[];
  quoteWords: JCWord[];
};
