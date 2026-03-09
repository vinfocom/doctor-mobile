import client from './client';

export const getCalendarData = async (year: number, month: number) => {
    const response = await client.get(`/calendar?year=${year}&month=${month}`);
    return response.data;
};
