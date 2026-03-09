import client from './client';

export const getLeaves = async (): Promise<{ leave_id: number; date: string; reason: string }[]> => {
    const res = await client.get('/leaves');
    return res.data.leaves || [];
};

export const addLeave = async (date: string, reason: string) => {
    const res = await client.post('/leaves', { date, reason });
    return res.data;
};

export const deleteLeave = async (leaveId: number) => {
    const res = await client.delete(`/leaves?leaveId=${leaveId}`);
    return res.data;
};
