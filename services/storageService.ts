import { PatentData } from "../types";

const STORAGE_KEY = 'patent_pro_data';

export const getPatents = (): PatentData[] => {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    console.error("Failed to load patents", e);
    return [];
  }
};

export const getPatentById = (id: string): PatentData | undefined => {
  const patents = getPatents();
  return patents.find(p => p.id === id);
};

export const savePatentToStorage = (patent: PatentData): void => {
  const patents = getPatents();
  const index = patents.findIndex(p => p.id === patent.id);
  
  const updatedPatent = {
      ...patent,
      lastModified: Date.now()
  };

  if (index >= 0) {
    patents[index] = updatedPatent;
  } else {
    patents.push(updatedPatent);
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(patents));
};

export const deletePatentFromStorage = (id: string): void => {
  const patents = getPatents();
  const newPatents = patents.filter(p => p.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(newPatents));
};

export const createNewPatentData = (): PatentData => {
    return {
        id: crypto.randomUUID(),
        title: '未命名专利',
        status: 'draft',
        createdAt: Date.now(),
        lastModified: Date.now(),
        technicalField: '',
        backgroundArt: '',
        inventionContent: '',
        descriptionOfDrawings: '',
        drawings: [],
        detailedDescription: '',
        claims: '',
        abstract: ''
    };
};