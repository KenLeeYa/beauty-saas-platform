import {z} from 'zod';

export const contactSchema = z.object({
  name: z.string().trim().min(1, '請填寫姓名').max(120),
  phone: z.string().trim().regex(/^[+\d()\s-]{6,40}$/, '請填寫有效電話'),
});
export type BookingContact = z.infer<typeof contactSchema>;
