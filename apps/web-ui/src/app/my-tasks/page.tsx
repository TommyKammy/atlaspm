'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useI18n } from '@/lib/i18n';

export default function MyTasksPage() {
  const { t } = useI18n();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('myTasks')}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">{t('listViewIsPlanned')}</p>
      </CardContent>
    </Card>
  );
}
