// Validation rules for React Hook Form

export const validationRules = {
  // Required field
  required: (fieldName: string) => ({
    required: `${fieldName} es requerido`
  }),

  // Email validation
  email: {
    required: 'El email es requerido',
    pattern: {
      value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
      message: 'Email inválido'
    }
  },

  // Password validation
  password: {
    required: 'La contraseña es requerida',
    minLength: {
      value: 8,
      message: 'La contraseña debe tener al menos 8 caracteres'
    }
  },

  // URL validation
  url: {
    pattern: {
      value: /^(https?:\/\/)?([\da-z.-]+)\.([a-z.]{2,6})([/\w .-]*)*\/?$/,
      message: 'URL inválida'
    }
  },

  // Phone validation (Uruguay format)
  phone: {
    pattern: {
      value: /^(\+598|0)?9[1-9]\d{6}$/,
      message: 'Teléfono inválido (formato: 099123456)'
    }
  },

  // Latitude validation
  latitude: {
    min: {
      value: -90,
      message: 'La latitud debe estar entre -90 y 90'
    },
    max: {
      value: 90,
      message: 'La latitud debe estar entre -90 y 90'
    }
  },

  // Longitude validation
  longitude: {
    min: {
      value: -180,
      message: 'La longitud debe estar entre -180 y 180'
    },
    max: {
      value: 180,
      message: 'La longitud debe estar entre -180 y 180'
    }
  },

  // Price validation
  price: {
    min: {
      value: 0,
      message: 'El precio debe ser mayor o igual a 0'
    }
  },

  // Date validation
  date: (fieldName: string) => ({
    required: `${fieldName} es requerida`,
    validate: (value: string) => {
      const date = new Date(value);
      return !isNaN(date.getTime()) || 'Fecha inválida';
    }
  }),

  // Future date validation
  futureDate: (fieldName: string) => ({
    required: `${fieldName} es requerida`,
    validate: (value: string) => {
      const date = new Date(value);
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      return date >= now || 'La fecha debe ser hoy o en el futuro';
    }
  }),

  // Min length validation
  minLength: (fieldName: string, min: number) => ({
    minLength: {
      value: min,
      message: `${fieldName} debe tener al menos ${min} caracteres`
    }
  }),

  // Max length validation
  maxLength: (fieldName: string, max: number) => ({
    maxLength: {
      value: max,
      message: `${fieldName} no puede exceder ${max} caracteres`
    }
  }),

  // Text area (description) validation
  description: {
    required: 'La descripción es requerida',
    minLength: {
      value: 10,
      message: 'La descripción debe tener al menos 10 caracteres'
    },
    maxLength: {
      value: 2000,
      message: 'La descripción no puede exceder 2000 caracteres'
    }
  },

  // Title validation
  title: {
    required: 'El título es requerido',
    minLength: {
      value: 3,
      message: 'El título debe tener al menos 3 caracteres'
    },
    maxLength: {
      value: 200,
      message: 'El título no puede exceder 200 caracteres'
    }
  }
};

// Helper function to combine validation rules
export const combineRules = (...rules: any[]) => {
  return Object.assign({}, ...rules);
};
