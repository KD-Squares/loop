// Editing a saved quiz uses the same editor as review. This route just forwards
// to it so links like /quiz/:id/edit keep working.
import { redirect } from "next/navigation";

export default function EditRedirect({
  params,
}: {
  params: { quizId: string };
}) {
  redirect(`/quiz/${params.quizId}/review`);
}
