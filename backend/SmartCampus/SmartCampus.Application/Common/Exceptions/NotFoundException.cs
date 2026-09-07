using System;
using System.Collections.Generic;
using System.Text;

namespace SmartCampus.Application.Common.Exceptions
{
    public sealed class NotFoundException : Exception
    {
        public NotFoundException(string message)
            : base(message)
        {
        }

        public NotFoundException(string name, object key)
            : base($"{name} with key '{key}' was not found.")
        {
        }
    }
}
