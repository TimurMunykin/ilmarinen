// platform/apps/web/src/components/chat/spec-card.tsx
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { AppSpec } from '@/lib/api';

interface SpecCardProps {
  spec: AppSpec;
  onConfirm: () => void;
  onEdit: () => void;
  isCreating: boolean;
}

export function SpecCard({ spec, onConfirm, onEdit, isCreating }: SpecCardProps) {
  const { t } = useTranslation();

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>{t('chat.specCard.title')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="font-semibold">{spec.name}</p>
          <p className="text-sm text-muted-foreground">{spec.description}</p>
        </div>

        <div>
          <p className="text-sm font-medium mb-1">{t('chat.specCard.models')}</p>
          <div className="space-y-2">
            {spec.models.map((model) => (
              <div key={model.name}>
                <p className="text-sm font-medium">{model.name}</p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {model.fields.map((field) => (
                    <Badge key={field.name} variant="secondary">
                      {field.name}: {field.type}
                    </Badge>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <p className="text-sm font-medium mb-1">{t('chat.specCard.screens')}</p>
          <div className="flex flex-wrap gap-1">
            {spec.screens.map((screen) => (
              <Badge key={screen.name} variant="outline">
                {screen.name}
              </Badge>
            ))}
          </div>
        </div>

        {spec.notifications && spec.notifications.length > 0 && (
          <div>
            <p className="text-sm font-medium mb-1">{t('chat.specCard.notifications')}</p>
            <div className="space-y-1">
              {spec.notifications.map((n, i) => (
                <p key={i} className="text-sm text-muted-foreground">
                  {n.trigger.model} — {n.trigger.condition}
                </p>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <Button onClick={onConfirm} disabled={isCreating} className="flex-1">
            {isCreating ? (
              <span className="flex items-center gap-2">
                <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                {t('chat.specCard.create')}
              </span>
            ) : (
              t('chat.specCard.create')
            )}
          </Button>
          <Button variant="outline" onClick={onEdit} disabled={isCreating}>
            {t('chat.specCard.edit')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
