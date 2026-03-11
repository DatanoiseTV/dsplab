export interface ExportOption {
  value: string;
  label: string;
  ext: string;
  mime: string;
}

export const EXPORT_OPTIONS: ExportOption[] = [
  { value: 'c',        label: 'C / C++',              ext: '.cpp',  mime: 'text/x-c' },
  { value: 'c-pd',     label: 'C / C++ (Pure Data)',  ext: '.cpp',  mime: 'text/x-c' },
  { value: 'c-teensy', label: 'C / C++ (Teensy)',     ext: '.cpp',  mime: 'text/x-c' },
  { value: 'js',       label: 'JavaScript',           ext: '.js',   mime: 'text/javascript' },
  { value: 'lua',      label: 'Lua',                  ext: '.lua',  mime: 'text/x-lua' },
  { value: 'java',     label: 'Java',                 ext: '.java', mime: 'text/x-java' },
];
