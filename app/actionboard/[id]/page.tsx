import ActionBoardDetail from "@/components/ActionBoardDetail";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ActionBoardDetail boardId={id} />;
}
